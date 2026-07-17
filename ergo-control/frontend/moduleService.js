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

// ─── Estado interno ───────────────────────────────────────────────────────────
let socket        = null;
let listeners     = new Map();   // id → callback(rawData, parsedData)
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU — cada item é [pitch, roll]
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;

let currentMode   = 'IDLE';      // 'EMG' | 'IMU' | 'DUAL' | 'IDLE' — espelha o modo pedido
let wifiForced    = false;       // se já forçámos o uso da wifi do módulo

let recvBuffer    = Buffer.alloc(0);   // buffer de receção acumulado (frames binários)
let textLineBuf   = '';                // buffer de linha (modo IMU, texto)

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
      // sem SYNC ainda — mantém só os últimos bytes (podem ser início de um SYNC cortado)
      if (recvBuffer.length > SYNC_BYTES) {
        recvBuffer = recvBuffer.slice(recvBuffer.length - (SYNC_BYTES - 1));
      }
      return;
    }

    // Descarta lixo antes do SYNC encontrado.
    // No modo DUAL isto inclui sempre o byte de sensor_id que o STM32 escreve
    // antes do sync (ver build_dual_packet no firmware) — é esperado e normal.
    if (syncIdx > 0) recvBuffer = recvBuffer.slice(syncIdx);

    if (currentMode === 'DUAL') {
      // Precisamos de pelo menos SYNC(4)+seq(2)+nsamp(2)+imu_samp(2) para calcular o frame
      if (recvBuffer.length < SYNC_BYTES + 2 + 2 + 2) return;

      const nsamp   = recvBuffer.readUInt16LE(SYNC_BYTES + 2);     // offset 6
      const imusamp = recvBuffer.readUInt16LE(SYNC_BYTES + 2 + 2); // offset 8

      // Valores absurdos → este SYNC não é um frame DUAL válido (ex: bytes
      // residuais de uma transição de modo). Descarta-o e procura o próximo.
      if (nsamp > MAX_NSAMP || imusamp > MAX_IMU_SAMP) {
        recvBuffer = recvBuffer.slice(SYNC_BYTES);
        continue;
      }

      const frameLen = DUAL_HEADER_BYTES
                      + imusamp * 4   // Pitch
                      + imusamp * 4   // Roll
                      + nsamp * 2     // amostras EMG
                      + DUAL_TRAILER_BYTES; // battery + crc

      if (recvBuffer.length < frameLen) return; // frame ainda incompleto — espera mais dados
      const frame = recvBuffer.slice(0, frameLen);
      recvBuffer = recvBuffer.slice(frameLen);

      let dataOff = DUAL_HEADER_BYTES;
      const pitchArr = [];
      for (let i = 0; i < imusamp; i++) { pitchArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      const rollArr = [];
      for (let i = 0; i < imusamp; i++) { rollArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      const emgArr = [];
      for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }
      // trailer (battery + crc, 4 bytes) segue-se, não é preciso para os gráficos

      const imuSamples = pitchArr.map((p, i) => [p, rollArr[i]]); // [pitch, roll]

      if (calibMode) calibBuffer.push(...emgArr);
      if (monitoring) {
        emgBuffer.push(...emgArr);
        imuBuffer.push(...imuSamples);
      }

      // LOG TEMPORÁRIO — remover depois de confirmar
      console.log('[ModuleService] frame DUAL parseado:', nsamp, 'EMG +', imusamp, 'IMU | emgBuffer=', emgBuffer.length);

      const parsed = { type: 'FRAME', emg: emgArr, imu: imuSamples };
      listeners.forEach((cb) => cb(frame, parsed));
      onData && onData(frame, parsed);

    } else {
      // Modo EMG: sync no offset 0, seguido do sensor_id (1 byte) antes de seq/nsamp
      // Precisamos de pelo menos SYNC(4)+sensor_id(1)+seq(2)+nsamp(2) para ler o nsamp
      if (recvBuffer.length < SYNC_BYTES + 1 + 2 + 2) return;

      const nsamp = recvBuffer.readUInt16LE(SYNC_BYTES + 1 + 2); // offset 7

      // Valor absurdo → SYNC não é um frame EMG válido — descarta e procura o próximo
      if (nsamp > MAX_NSAMP) {
        recvBuffer = recvBuffer.slice(SYNC_BYTES);
        continue;
      }

      const frameLen = EMG_HEADER_BYTES + nsamp * 2 + EMG_TRAILER_BYTES;
      if (recvBuffer.length < frameLen) return;

      const frame = recvBuffer.slice(0, frameLen);
      recvBuffer = recvBuffer.slice(frameLen);

      let dataOff = EMG_HEADER_BYTES;
      const emgArr = [];
      for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }
      // trailer (battery + crc, 4 bytes) segue-se, não é preciso para os gráficos

      if (calibMode) calibBuffer.push(...emgArr);
      if (monitoring) emgBuffer.push(...emgArr);

      // LOG TEMPORÁRIO — remover depois de confirmar
      console.log('[ModuleService] frame EMG parseado:', nsamp, 'amostras | emgBuffer=', emgBuffer.length);

      const parsed = { type: 'FRAME', emg: emgArr, imu: [] };
      listeners.forEach((cb) => cb(frame, parsed));
      onData && onData(frame, parsed);
    }
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

  // LOG TEMPORÁRIO — remover depois de confirmar
  console.log(
    '[ModuleService] dados recebidos:', chunk.length, 'bytes | modo=' + currentMode,
    '| monitoring=' + monitoring,
    '| primeiros bytes=', chunk.slice(0, 16).toString('hex')
  );

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

          setTimeout(() => {
            onOpen && onOpen();
          }, 300);
        }
      );

      socket.on('data', (data) => handleIncomingData(data, onData));

      socket.on('close', () => {
        console.log('[ModuleService] TCP fechado');
        socket = null;
        onClose && onClose();
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
      socket.destroy();
      socket = null;
    }
    currentMode = 'IDLE';
    await releaseModuleWifi();
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

    // LOG TEMPORÁRIO — remover depois de confirmar
    console.log(`[ModuleService] a enviar comando: "${str}" (modo interno agora=${currentMode})`);

    socket.write(str + '\n');
    return true;
  },

  /** Calcula e envia o prescaler de frequência ao módulo (fórmula espelha o firmware). */
  setFrequency(hz) {
    const freqValue = Math.round((280e6) / (27 * hz));
    this.sendCommand('FREQ');
    this.sendCommand(String(freqValue));
    return freqValue;
  },

  startMonitoring(mode) {
    emgBuffer = [];
    imuBuffer = [];
    monitoring = true;

    // LOG TEMPORÁRIO — remover depois de confirmar
    console.log(`[ModuleService] startMonitoring("${mode}") | socket ligado? ${socket !== null}`);

    this.sendCommand(mode);
  },

  stopMonitoring() {
    monitoring = false;
    this.sendCommand('IDLE');

    // LOG TEMPORÁRIO — remover depois de confirmar
    console.log(`[ModuleService] stopMonitoring() | emgBuffer=${emgBuffer.length} imuBuffer=${imuBuffer.length}`);

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

  addListener(id, callback) {
    listeners.set(id, callback);
  },

  removeListener(id) {
    listeners.delete(id);
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