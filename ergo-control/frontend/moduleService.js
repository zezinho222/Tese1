/**
 * moduleService.js
 * Serviço singleton para comunicação com o módulo (STM32 + ESP32) via socket TCP em bruto.
 *
 * Protocolo confirmado a partir do firmware (main.c):
 *
 *  MODO IMU (texto, sem prefixo):
 *    "<pitch>, <roll>\n"   (dois floats separados por vírgula)
 *
 *  MODO EMG (binário — struct EmgFrame __packed__ enviada em bruto):
 *    sync(4) + sensor_id(1) + seq(2) + nsamp(2) + timestamp(4)
 *    + data[nsamp](nsamp×2) + battery(2) + crc(2)
 *
 *  MODO DUAL (binário — montado por build_dual_packet no STM32):
 *    sensor_id(1) + sync(4) + seq(2) + nsamp(2) + imu_samp(2) + timestamp(4)
 *    + Pitch[imu_samp](×4) + Roll[imu_samp](×4) + data[nsamp](×2) + battery(2) + crc(2)
 *
 *  Nota importante: no modo DUAL o sensor_id vem ANTES do sync (não depois,
 *  como no modo EMG). O parser localiza sempre o sync via indexOf e descarta
 *  tudo antes dele, por isso o byte de sensor_id do DUAL é absorvido
 *  automaticamente como "lixo antes do sync" — não precisa de ser contado
 *  no header. Já no modo EMG o sensor_id vem DEPOIS do sync, dentro do
 *  próprio header, por isso TEM de ser contado explicitamente.
 *
 *  Em ambos os modos binários, nsamp/imu_samp vêm dentro do próprio frame —
 *  o tamanho de cada frame é sempre calculado a partir daí, nunca assumido.
 */

import TcpSocket from 'react-native-tcp-socket';
import NetInfo from '@react-native-community/netinfo';
import { Buffer } from 'buffer';

const MODULE_IP   = '192.168.4.1';
const MODULE_PORT = 1234;

// ─── Constantes do protocolo ──────────────────────────────────────────────────
const SYNC_WORD    = 0xDEADBEEF;
const SYNC_PATTERN = Buffer.from([0xEF, 0xBE, 0xAD, 0xDE]); // 0xDEADBEEF em little-endian
const SYNC_BYTES   = 4;

// Modo EMG: sync(4) + sensor_id(1) + seq(2) + nsamp(2) + timestamp(4) = 13 bytes até aos dados
// (struct EmgFrame packed, enviada tal-e-qual pelo STM32 — sensor_id ESTÁ presente,
// logo a seguir ao sync)
const EMG_HEADER_BYTES  = SYNC_BYTES + 1 + 2 + 2 + 4; // 13
// Trailer: battery(2) + crc(2)
const EMG_TRAILER_BYTES = 2 + 2; // 4

// Modo DUAL: sync(4) + seq(2) + nsamp(2) + imu_samp(2) + timestamp(4) = 14 bytes até aos dados
// (o sensor_id que o STM32 escreve ANTES do sync é descartado como lixo antes
// de chegarmos aqui — ver tryParseBinaryFrames)
const DUAL_HEADER_BYTES  = SYNC_BYTES + 2 + 2 + 2 + 4; // 14
// Trailer: battery(2) + crc(2)
const DUAL_TRAILER_BYTES = 2 + 2; // 4

// Limites de sanidade — se nsamp/imu_samp lidos vierem acima disto, é sinal
// de que o SYNC encontrado não é o início real de um frame válido neste modo
// (ex: bytes residuais de uma transição de modo). Nesse caso, descarta este
// SYNC e procura o próximo, em vez de ficar à espera de um frame gigante
// que nunca vai completar.
const MAX_NSAMP    = 1024; // firmware usa sempre 256
const MAX_IMU_SAMP = 64;   // firmware usa no máximo 26

// Maior frame possível dentro dos limites de sanidade acima. Um buffer maior
// do que isto sem nenhum SYNC lá dentro é mesmo lixo e pode ser aparado.
const MAX_FRAME_BYTES = DUAL_HEADER_BYTES + MAX_IMU_SAMP * 8 + MAX_NSAMP * 2 + DUAL_TRAILER_BYTES;

// ─── Estado interno ───────────────────────────────────────────────────────────
let socket        = null;
let listeners     = new Map();   // id → callback(rawData, parsedData)
let closeListeners = new Map();  // id → callback(), só chamado em desconexões INESPERADAS
let expectedClose  = false;      // true enquanto um disconnect() intencional está em curso
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU — cada item é [pitch, roll]
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;

let currentMode   = 'IDLE';      // 'EMG' | 'IMU' | 'DUAL' | 'IDLE' — espelha o modo pedido
let wifiForced    = false;       // se já forçámos o uso da wifi do módulo

let recvBuffer    = Buffer.alloc(0);   // buffer de receção acumulado (frames binários)
let textLineBuf   = '';                // buffer de linha (modo IMU, texto)
let netUnsubscribe = null;             // listener de conectividade — deteta perda da Wi-Fi do módulo

// ─── Vigilância da Wi-Fi do módulo ────────────────────────────────────────────
// Um socket TCP só deteta uma ligação morta quando se tenta mesmo enviar/
// receber dados por ele (ex: só ao clicar "Parar" ou "Calibrar", que enviam
// um comando) — sem isso, pode ficar "pendurado" durante muito tempo sem dar
// erro nenhum. O NetInfo, pelo contrário, sabe de imediato quando o telemóvel
// desliga da rede Wi-Fi do módulo (ou perde o sinal), por isso usamo-lo para
// fechar o socket (e notificar) assim que isso acontece, em vez de esperar
// pela próxima ação do utilizador.
function startWifiWatch() {
  if (netUnsubscribe) return;
  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (!socket) return; // nada ligado para vigiar
    if (state.type !== 'wifi' || state.isConnected === false) {
      console.log('[ModuleService] Wi-Fi do módulo perdida — a fechar ligação.');
      try { socket.destroy(); } catch {}
      // Não mexe em expectedClose nem chama closeListeners aqui — o
      // destroy() dispara o 'close' do socket (ver connect()), que já trata
      // disto como desconexão inesperada e notifica quem estiver à escuta.
    }
  });
}

function stopWifiWatch() {
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
}

// ─── Wi-Fi forçado (Android) ──────────────────────────────────────────────────
async function bindToModuleWifi() {
  try {
    const WifiManager = require('react-native-wifi-reborn').default;
    await WifiManager.forceWifiUsage(true);
    wifiForced = true;
  } catch (e) {
    console.log('[ModuleService] forceWifiUsage(true) falhou:', e);
  }
}

async function releaseModuleWifi() {
  if (!wifiForced) return;
  try {
    const WifiManager = require('react-native-wifi-reborn').default;
    await WifiManager.forceWifiUsage(false);
  } catch (e) {
    console.log('[ModuleService] forceWifiUsage(false) falhou:', e);
  } finally {
    wifiForced = false;
  }
}

// ─── Parsing de frames binários (EMG / DUAL) ─────────────────────────────────
function tryParseBinaryFrames(onData) {
  while (true) {
    const syncIdx = recvBuffer.indexOf(SYNC_PATTERN);
    if (syncIdx === -1) {
      // Sem SYNC à vista. NÃO se pode esvaziar o buffer aqui: se o frame
      // anterior tiver consumido bytes a mais e comido o SYNC seguinte,
      // isto deitava fora um pacote inteiro em silêncio — era exatamente
      // a causa de se perder metade das amostras de cada sessão.
      // Só apara quando o buffer já é grande demais para conter um frame.
      if (recvBuffer.length > MAX_FRAME_BYTES) {
        recvBuffer = recvBuffer.slice(recvBuffer.length - (SYNC_BYTES - 1));
      }
      return;
    }

    // Descarta lixo antes do SYNC. No modo DUAL isto inclui o byte de
    // sensor_id que o STM32 escreve antes do sync (ver build_dual_packet),
    // mais os poucos bytes que o ESP32 injeta entre frames.
    if (syncIdx > 0) recvBuffer = recvBuffer.slice(syncIdx);

    const isDual     = currentMode === 'DUAL';
    const headerLen  = isDual ? DUAL_HEADER_BYTES : EMG_HEADER_BYTES;
    const trailerLen = isDual ? DUAL_TRAILER_BYTES : EMG_TRAILER_BYTES;
    if (recvBuffer.length < headerLen) return;

    // nsamp/imu_samp vêm dentro do próprio frame — nunca são assumidos.
    const nsamp   = isDual ? recvBuffer.readUInt16LE(SYNC_BYTES + 2)      // offset 6
                           : recvBuffer.readUInt16LE(SYNC_BYTES + 1 + 2); // offset 7
    const imusamp = isDual ? recvBuffer.readUInt16LE(SYNC_BYTES + 2 + 2)  // offset 8
                           : 0;

    // Valores absurdos → este SYNC não é o início real de um frame neste
    // modo (ex: bytes residuais de uma transição de modo). Descarta-o e
    // procura o próximo, em vez de esperar por um frame que nunca completa.
    if (nsamp === 0 || nsamp > MAX_NSAMP || imusamp > MAX_IMU_SAMP) {
      recvBuffer = recvBuffer.slice(SYNC_BYTES);
      continue;
    }

    // dataEnd = fim das amostras (o que precisamos mesmo).
    // frameLen inclui ainda battery+crc, que o ESP32 por vezes corta.
    const dataEnd  = headerLen + imusamp * 8 + nsamp * 2;
    const frameLen = dataEnd + trailerLen;

    if (recvBuffer.length < dataEnd) return; // amostras ainda incompletas

    // Fronteira REAL do frame: o próximo SYNC. O frame_size do NINA não
    // coincide com o tamanho do pacote do STM32 (falta-lhe o sensor_id e
    // parte do trailer), por isso o bloco entregue é 2–3 bytes mais curto
    // do que frameLen. Consumir frameLen às cegas comia o SYNC seguinte.
    // Um SYNC que apareça antes do fim das amostras é falso (o padrão
    // 0xDEADBEEF pode calhar nos dados do ADC) — procura-se o seguinte.
    let nextSync = recvBuffer.indexOf(SYNC_PATTERN, SYNC_BYTES);
    while (nextSync !== -1 && nextSync < dataEnd) {
      nextSync = recvBuffer.indexOf(SYNC_PATTERN, nextSync + 1);
    }

    let consume;
    if (nextSync === -1) {
      // Frame seguinte ainda não chegou: espera até haver folga suficiente
      // para ter a certeza de que ele não vinha logo a seguir.
      if (recvBuffer.length < frameLen + SYNC_BYTES + 4) return;
      consume = Math.min(frameLen, recvBuffer.length);
    } else {
      consume = Math.min(frameLen, nextSync);
    }

    const frame = recvBuffer.slice(0, consume);
    recvBuffer  = recvBuffer.slice(consume);

    let dataOff = headerLen;
    const pitchArr = [];
    const rollArr  = [];
    if (isDual) {
      for (let i = 0; i < imusamp; i++) { pitchArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      for (let i = 0; i < imusamp; i++) { rollArr.push(frame.readFloatLE(dataOff));  dataOff += 4; }
    }
    const emgArr = [];
    for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }
    // trailer (battery + crc) pode vir cortado pelo ESP32 — não é preciso aqui

    const imuSamples = pitchArr.map((p, i) => [p, rollArr[i]]); // [pitch, roll]

    if (calibMode) calibBuffer.push(...emgArr);
    if (monitoring) {
      emgBuffer.push(...emgArr);
      if (isDual) imuBuffer.push(...imuSamples);
    }

    const parsed = { type: 'FRAME', emg: emgArr, imu: imuSamples };
    listeners.forEach((cb) => cb(frame, parsed));
    onData && onData(frame, parsed);
  }
}

// ─── Parsing de linhas de texto (modo IMU) ───────────────────────────────────
function parseTextLine(line, onData) {
  const str = line.trim();
  const parts = str.split(',').map((s) => parseFloat(s.trim()));

  let parsed;
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    // Formato real do firmware: "<pitch>, <roll>" — sem prefixo
    parsed = { type: 'IMU', value: parts }; // [pitch, roll]
    if (monitoring) imuBuffer.push(parts);
  } else {
    // Mensagens informativas (ex: respostas de POT/FREQ) — não são dados de gráfico
    parsed = { type: 'TEXT', value: str };
  }
  listeners.forEach((cb) => cb(str, parsed));
  onData && onData(str, parsed);
}

function handleIncomingData(data, onData) {
  const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

  if (currentMode === 'EMG' || currentMode === 'DUAL') {
    recvBuffer = Buffer.concat([recvBuffer, chunk]);
    tryParseBinaryFrames(onData);
  } else {
    // modo texto (IMU/POT/FREQ/IDLE) — linhas terminadas em '\n'
    textLineBuf += chunk.toString('utf8');
    let nl;
    while ((nl = textLineBuf.indexOf('\n')) !== -1) {
      const line = textLineBuf.slice(0, nl);
      textLineBuf = textLineBuf.slice(nl + 1);
      if (line.length) parseTextLine(line, onData);
    }
  }
}

// ─── Módulo público ───────────────────────────────────────────────────────────
const moduleService = {
  isModuleReachable() {
    return new Promise((resolve) => {
      let settled = false;
      const testSocket = TcpSocket.createConnection(
        { port: MODULE_PORT, host: MODULE_IP },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          testSocket.destroy();
          resolve(true);
        }
      );

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        testSocket.destroy();
        resolve(false);
      }, 5000);

      testSocket.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });
    });
  },

  async connect({ onOpen, onClose, onError, onData } = {}) {
    if (socket) {
      onOpen && onOpen();
      return;
    }
    if (socket && socket.readyState === 0) return;

    recvBuffer = Buffer.alloc(0);
    textLineBuf = '';
    expectedClose = false;

    await bindToModuleWifi();

    try {
      socket = TcpSocket.createConnection(
        { port: MODULE_PORT, host: MODULE_IP },
        () => {
          console.log(`[ModuleService] TCP ligado a ${MODULE_IP}:${MODULE_PORT}`);

          // Comando de "aquecimento": o primeiro comando enviado logo a
          // seguir à ligação chega sempre em branco ao módulo (a porta série
          // do STM32 ainda não está pronta a processar). Este comando extra
          // absorve essa perda — o STM32 não o reconhece
          // ("Unknown command: Olá"), mas não tem qualquer efeito no
          // firmware. Só depois de o enviar é que avisamos quem chamou
          // connect() que já pode enviar comandos reais.
          socket.write('Olá\n');
          // Reforço a nível de TCP — ajuda o SO a detetar mais cedo uma
          // ligação morta mesmo sem tráfego de dados (ex: módulo parado,
          // sem monitorização em curso). A deteção "instantânea" real vem
          // do NetInfo (startWifiWatch), isto é só complementar.
          try { socket.setKeepAlive(true, 1000); } catch {}
          startWifiWatch();

          setTimeout(() => {
            onOpen && onOpen();
          }, 300);
        }
      );

      socket.on('data', (data) => handleIncomingData(data, onData));

      socket.on('close', () => {
        console.log('[ModuleService] TCP fechado');
        socket = null;
        stopWifiWatch();
        onClose && onClose();
        if (!expectedClose) {
          // Ligação caiu sem ter sido pedida (ex: saíste do alcance da
          // Wi-Fi do módulo, ou o módulo desligou-se) — avisa quem estiver
          // interessado (ex: notificação de estado do dispositivo).
          closeListeners.forEach((cb) => cb());
        }
      });

      socket.on('error', (e) => {
        console.log('[ModuleService] Erro TCP:', e?.message ?? e);
        onError && onError(e);
      });
    } catch (e) {
      console.log('[ModuleService] Falha ao criar socket TCP:', e);
      onError && onError(e);
    }
  },

  async disconnect() {
    if (socket) {
      const s = socket;
      socket = null; // marca já como desligado para o resto da app (isConnected/ensureConnected)
      expectedClose = true; // este close vem de nós — não é uma desconexão inesperada
      try {
        // Fecho gracioso (FIN) em vez de destroy() abrupto (RST) — a ponte
        // Wi-Fi↔UART do módulo parece não detetar bem um cliente a cair de
        // forma abrupta, ficando "presa" a pensar que o cliente anterior
        // ainda está ligado e nunca mais liga os dados a uma reconexão
        // seguinte (socket aceite, mas zero bytes chegam depois disso).
        s.end();
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        // ignora — segue para o destroy() de garantia abaixo
      }
      try { s.destroy(); } catch (e) {}
    }
    currentMode = 'IDLE';
    await releaseModuleWifi();
  },

  /**
   * Garante que há ligação ao módulo, voltando a ligar se necessário.
   * Necessário porque a sincronização (syncService.trySyncAll) desliga o
   * módulo sempre que há internet real, para libertar a Wi-Fi forçada — ao
   * voltar à rede do módulo, o socket já não existe e tem de ser recriado
   * antes de se poder monitorizar/calibrar outra vez.
   *
   * O offset (POT) e a frequência (FREQ) são estado por-ligação no
   * firmware — perdem-se sempre que o socket TCP cai, por isso, se forem
   * passados aqui, são reenviados logo a seguir a ligar de novo (mesma
   * sequência que o ConnectModulePage usa da primeira vez).
   *
   * IMPORTANTE: no firmware (main.c), tanto o handler de POT como o de FREQ
   * fazem um HAL_Delay(2000) BLOQUEANTE ao processar o valor recebido, e o
   * buffer de comandos UART (command_buffer) é um único slot — não uma
   * fila. Qualquer comando enviado enquanto o STM32 está preso nesse delay
   * é silenciosamente perdido (substituído pelo próximo). Por isso a
   * espera aqui tem de ser MAIOR que 2000ms depois de cada valor, senão o
   * FREQ (ou até o comando de modo EMG/DUAL a seguir) nunca chega a ser
   * aplicado e o módulo fica sem transmitir dados, sem erro nenhum.
   */
  async ensureConnected({ offsetValue, freqValue } = {}) {
    if (socket) return true;

    const ok = await new Promise((resolve) => {
      this.connect({
        onOpen: () => resolve(true),
        onError: () => resolve(false),
      });
    });
    if (!ok) return false;

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // 2500ms deixava margem demasiado apertada sobre o HAL_Delay(2000) do
    // firmware: contando só a partir do send() em JS (sem contar a latência
    // Wi-Fi + ponte UART até o STM32 REALMENTE começar o delay), o comando
    // seguinte por vezes chegava ainda dentro da janela bloqueada e era
    // perdido — sintoma: reconectar depois de uma queda funcionava bem na
    // Monitorização (que tem um await a gravar a sessão localmente antes de
    // enviar o modo, dando folga extra sem querer) mas falhava sempre na
    // Calibração (que envia "EMG" logo a seguir a isto, sem folga nenhuma),
    // dando sempre MVC 0.0000 por a calibração nunca chegar a arrancar de
    // facto no módulo.
    if (offsetValue != null) {
      this.sendCommand('POT');
      this.sendCommand(String(offsetValue));
      await wait(3200); // > HAL_Delay(2000) do handler de POT no firmware + margem de latência
    }
    if (freqValue != null) {
      this.sendCommand('FREQ');
      this.sendCommand(String(freqValue));
      await wait(3200); // > HAL_Delay(2000) do handler de FREQ no firmware + margem de latência
    }
    return true;
  },

  sendCommand(cmd) {
    if (!socket) {
      console.warn('[ModuleService] Não foi possível enviar — socket não ligado');
      return false;
    }
    const str = String(cmd);
    const upper = str.toUpperCase();
    if (['EMG', 'IMU', 'DUAL', 'IDLE'].includes(upper)) {
      currentMode = upper;
      // Descarta bytes pendentes do modo anterior — podem estar num formato
      // incompatível com o novo modo (ex: um último frame EMG a chegar já
      // depois de termos mudado para DUAL) e desalinhar o parser para sempre.
      recvBuffer = Buffer.alloc(0);
      textLineBuf = '';
    }

    socket.write(str + '\n');
    return true;
  },

  /**
   * Calcula e envia o prescaler de frequência ao módulo.
   * Firmware: f = 280MHz / ((prescaler + 1) * 27)  →  prescaler = 280e6/(27*hz) - 1
   */
  setFrequency(hz) {
    const freqValue = Math.max(0, Math.round((280e6) / (27 * hz)) - 1);
    this.sendCommand('FREQ');
    this.sendCommand(String(freqValue));
    return freqValue;
  },

  startMonitoring(mode) {
    emgBuffer = [];
    imuBuffer = [];
    monitoring = true;
    this.sendCommand(mode);
  },

  stopMonitoring() {
    monitoring = false;
    this.sendCommand('IDLE');

    return {
      emgBuffer: [...emgBuffer],
      imuBuffer: [...imuBuffer],
    };
  },

  startCalibration() {
    calibBuffer = [];
    calibMode = true;
  },

  stopCalibration() {
    calibMode = false;
    return [...calibBuffer];
  },

  getBuffers() {
    return {
      emgBuffer: [...emgBuffer],
      imuBuffer: [...imuBuffer],
    };
  },

  /**
   * Como getBuffers(), mas só devolve os últimos `n` pontos de cada buffer —
   * usado pelo polling do gráfico (a cada 300ms), que só precisa dos últimos
   * pontos a mostrar. getBuffers() copia o array INTEIRO (`[...emgBuffer]`),
   * que durante uma monitorização cresce sem limite ao longo da sessão; a
   * chamar isso a cada 300ms, o custo de copiar o array inteiro aumenta com
   * a duração da sessão até o thread de JS começar a atrasar-se — os
   * setInterval acumulam-se e disparam em rajada assim que o thread liberta,
   * o que pode levar o React a exceder o limite de updates aninhados
   * ("Maximum update depth exceeded") passados alguns segundos/minutos de
   * monitorização. slice(-n) evita copiar o array todo.
   */
  getRecentBuffers(n) {
    return {
      emgBuffer: emgBuffer.slice(-n),
      imuBuffer: imuBuffer.slice(-n),
    };
  },

  addListener(id, callback) {
    listeners.set(id, callback);
  },

  removeListener(id) {
    listeners.delete(id);
  },

  /** callback() chamado só quando a ligação cai de forma inesperada (não via disconnect()). */
  addCloseListener(id, callback) {
    closeListeners.set(id, callback);
  },

  removeCloseListener(id) {
    closeListeners.delete(id);
  },

  isConnected() {
    return socket !== null;
  },

  // Verdadeiro durante monitorização OU calibração — usado para não
  // desligar o socket/Wi-Fi forçada a meio de uma aquisição em curso.
  isMonitoring() {
    return monitoring || calibMode;
  },

  getStatus() {
    return socket !== null ? 'connected' : 'disconnected';
  },
};

export default moduleService;