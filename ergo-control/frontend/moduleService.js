import TcpSocket from 'react-native-tcp-socket';
import NetInfo from '@react-native-community/netinfo';
import { Buffer } from 'buffer';
import { createPacketTracker } from './utils/packetLoss';

const MODULE_IP   = '192.168.4.1';
const MODULE_PORT = 1234;

const SYNC_WORD    = 0xDEADBEEF;
const SYNC_PATTERN = Buffer.from([0xEF, 0xBE, 0xAD, 0xDE]);
const SYNC_BYTES   = 4;

// Modo EMG: sync(4) + sensor_id(1) + seq(2) + nsamp(2) + timestamp(4) = 13 bytes
const EMG_HEADER_BYTES  = SYNC_BYTES + 1 + 2 + 2 + 4;
// Trailer = battery(2) + crc(2) = 4 bytes.
const EMG_TRAILER_BYTES = 2 + 2; 

// Modo DUAL: sync(4) + seq(2) + nsamp(2) + imu_samp(2) + timestamp(4) = 14 bytes
const DUAL_HEADER_BYTES  = SYNC_BYTES + 2 + 2 + 2 + 4; 
// Trailer: battery(2) + crc(2)
const DUAL_TRAILER_BYTES = 2 + 2;

// Limites de sanidade — se nsamp/imu_samp lidos vierem acima disto, é sinal
// de que o SYNC encontrado não é o início real de um frame válido neste modo
// (ex: bytes residuais de uma transição de modo)
// Nesse caso, descarta este SYNC e procura o próximo,
// em vez de ficar à espera de um frame gigante
// que nunca vai completar
const MAX_NSAMP    = 1024; // firmware usa sempre 256
const MAX_IMU_SAMP = 64;   // firmware usa no máximo 26

// Maior frame possível dentro dos limites de sanidade acima. Um buffer maior
// do que isto sem nenhum SYNC lá dentro é mesmo lixo e pode ser aparado
const MAX_FRAME_BYTES = DUAL_HEADER_BYTES + MAX_IMU_SAMP * 8 + MAX_NSAMP * 2 + DUAL_TRAILER_BYTES;

// Pedir "IMU" / "EMG" ao módulo como "DUAL" e descartar do lado da app o
// bloco do sensor que não interessa
// Pôr a false para voltar a usar os modos de sensor único do firmware tal e
// qual (IMU em texto, EMG no seu próprio formato binário)
const IMU_VIA_DUAL = true;
const EMG_VIA_DUAL = true;

let socket        = null;
let listeners     = new Map();   
let closeListeners = new Map();  
let expectedClose  = false;      
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU — cada item é [pitch, roll]
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;

let requestedMode = 'IDLE';
let currentMode   = 'IDLE';
let wifiForced    = false;       

// Contador de perda de pacotes, usa o campo `seq` do cabeçalho de cada frame como ID do pacote
// É reiniciado sempre que se muda de modo e lido no fim da monitorização.
let packetTracker = createPacketTracker();

let recvBuffer    = Buffer.alloc(0);   // buffer de receção acumulado
let textLineBuf   = '';                // buffer de linha 
let netUnsubscribe = null;             // listener de conectividade, deteta perda da Wi-Fi do módulo

// Ouve a rede do telemóvel e fecha o socket assim que a Wi-Fi do módulo desaparece
function startWifiWatch() {
  if (netUnsubscribe) return;
  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (!socket) return; 
    if (state.type !== 'wifi' || state.isConnected === false) {
      console.log('[ModuleService] Wi-Fi do módulo perdida — a fechar ligação.');
      try { socket.destroy(); } catch {}
    }
  });
}

// Remove o listener de rede registado em startWifiWatch(), quando já não é preciso vigiar
function stopWifiWatch() {
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
}

// Força o Android a usar a rede Wi-Fi do módulo para o tráfego, mesmo sem internet
async function bindToModuleWifi() {
  try {
    const WifiManager = require('react-native-wifi-reborn').default;
    await WifiManager.forceWifiUsage(true);
    wifiForced = true;
  } catch (e) {
    console.log('[ModuleService] forceWifiUsage(true) falhou:', e);
  }
}

// Liberta o forçar de Wi-Fi quando já não é preciso
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

// Parsing de frames binários (EMG / DUAL)
/* Faz parsing dos frames binários (EMG/DUAL) acumulados em recvBuffer
// Localiza o SYNC
// Valida e extrai as amostras de cada frame completo
// Alimenta os buffers de monitorização/calibração
// Notifica os listeners
*/
function tryParseBinaryFrames(onData) {
  while (true) {
    const syncIdx = recvBuffer.indexOf(SYNC_PATTERN);
    if (syncIdx === -1) {
      if (recvBuffer.length > MAX_FRAME_BYTES) {
        recvBuffer = recvBuffer.slice(recvBuffer.length - (SYNC_BYTES - 1));
      }
      return;
    }
    if (syncIdx > 0) recvBuffer = recvBuffer.slice(syncIdx);

    const isDual     = currentMode === 'DUAL';
    const headerLen  = isDual ? DUAL_HEADER_BYTES : EMG_HEADER_BYTES;
    const trailerLen = isDual ? DUAL_TRAILER_BYTES : EMG_TRAILER_BYTES;
    if (recvBuffer.length < headerLen) return;

    const seq     = isDual ? recvBuffer.readUInt16LE(SYNC_BYTES)
                           : recvBuffer.readUInt16LE(SYNC_BYTES + 1);
    const nsamp   = isDual ? recvBuffer.readUInt16LE(SYNC_BYTES + 2)
                           : recvBuffer.readUInt16LE(SYNC_BYTES + 1 + 2);
    const imusamp = isDual ? recvBuffer.readUInt16LE(SYNC_BYTES + 2 + 2)
                           : 0;

    if (nsamp === 0 || nsamp > MAX_NSAMP || imusamp > MAX_IMU_SAMP) {
      recvBuffer = recvBuffer.slice(SYNC_BYTES);
      continue;
    }

    // dataEnd = fim das amostras
    const dataEnd  = headerLen + imusamp * 8 + nsamp * 2;
    const frameLen = dataEnd + trailerLen;

    if (recvBuffer.length < dataEnd) return;
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

    const imuOnly = requestedMode === 'IMU';
    const emgOnly = requestedMode === 'EMG';

    packetTracker.track(seq, {
      emgSamples: imuOnly ? 0 : nsamp,
      imuSamples: emgOnly ? 0 : imusamp,
    });

    let dataOff = headerLen;
    const pitchArr = [];
    const rollArr  = [];
    if (isDual) {
      for (let i = 0; i < imusamp; i++) { pitchArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      for (let i = 0; i < imusamp; i++) { rollArr.push(frame.readFloatLE(dataOff));  dataOff += 4; }
    }
    const emgArr = [];
    for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }
    const imuSamples = pitchArr.map((p, i) => [p, rollArr[i]]);

    const emgOut  = imuOnly ? [] : emgArr;
    const imuOut  = emgOnly ? [] : imuSamples;

    if (calibMode) calibBuffer.push(...emgOut); // calibração é sempre EMG/DUAL, nunca IMU
    if (monitoring) {
      if (!imuOnly) emgBuffer.push(...emgArr);
      if (!emgOnly) imuBuffer.push(...imuSamples);
    }

    const parsed = { type: 'FRAME', emg: emgOut, imu: imuOut };
    listeners.forEach((cb) => cb(frame, parsed));
    onData && onData(frame, parsed);
  }
}

// Parsing de linhas de texto (modo IMU) 

function parseTextLine(line, onData) {
  const str = line.trim();
  const parts = str.split(',').map((s) => parseFloat(s.trim()));

  let parsed;
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    parsed = { type: 'IMU', value: parts }; // [pitch, roll]
    if (monitoring) imuBuffer.push(parts);
  } else {
    parsed = { type: 'TEXT', value: str };
  }
  listeners.forEach((cb) => cb(str, parsed));
  onData && onData(str, parsed);
}

// decide se os dados recebidos vão para o parser binário ou para o parser de texto, consoante o currentMode
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

// 
const moduleService = {
  // Testa se o módulo responde numa ligação TCP
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

  // Estabelece a ligação TCP ao módulo
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
          // Ligação caiu sem ter sido pedida (si do alcance da
          // Wi-Fi do módulo, ou o módulo desligou-se)
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

  // Fecha a ligação
  async disconnect() {
    if (socket) {
      const s = socket;
      socket = null;
      expectedClose = true; 
      try {
        s.end();
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
      }
      try { s.destroy(); } catch (e) {}
    }
    currentMode   = 'IDLE';
    requestedMode = 'IDLE';
    await releaseModuleWifi();
  },

  // Garante que há ligação, reconectando se necessário 
  // Reenvia POT/FREQ (que se perdem a cada queda de socket)
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
    if (offsetValue != null) {
      this.sendCommand('POT');
      this.sendCommand(String(offsetValue));
      await wait(3200);
    }
    if (freqValue != null) {
      this.sendCommand('FREQ');
      this.sendCommand(String(freqValue));
      await wait(3200);
    }
    return true;
  },

  // Envia comandos ao módulo (EMG IMU DUAL IDLE)
  sendCommand(cmd) {
    if (!socket) {
      console.warn('[ModuleService] Não foi possível enviar — socket não ligado');
      return false;
    }
    const str = String(cmd);
    const upper = str.toUpperCase();

    // O que segue mesmo para o módulo. Só difere do pedido nos casos
    let wire = str;

    if (['EMG', 'IMU', 'DUAL', 'IDLE'].includes(upper)) {
      requestedMode = upper;
      const viaDual = (upper === 'IMU' && IMU_VIA_DUAL) || (upper === 'EMG' && EMG_VIA_DUAL);
      wire = viaDual ? 'DUAL' : upper;
      currentMode = wire;
      if (viaDual) {
        const descartado = upper === 'IMU' ? 'sEMG' : 'IMU';
        console.log(`[ModuleService] Modo ${upper} pedido ao módulo como DUAL (${descartado} descartado na app)`);
      }
      recvBuffer = Buffer.alloc(0);
      textLineBuf = '';
      packetTracker.reset();
    }

    socket.write(wire + '\n');
    return true;
  },

  // Inicia uma sessão de monitorização
  startMonitoring(mode) {
    emgBuffer = [];
    imuBuffer = [];
    monitoring = true;
    packetTracker.reset();
    this.sendCommand(mode);
  },

  // Para uma sessão de monitorização
  stopMonitoring() {
    monitoring = false;
    const packetReport = packetTracker.getReport({
      emgSamplesReceived: emgBuffer.length,
      imuSamplesReceived: imuBuffer.length,
      hasEmg: requestedMode === 'EMG' || requestedMode === 'DUAL',
      hasImu: requestedMode === 'IMU' || requestedMode === 'DUAL',
    });

    this.sendCommand('IDLE');

    return {
      emgBuffer: [...emgBuffer],
      imuBuffer: [...imuBuffer],
      packetReport,
    };
  },

  // Inicia a calibração
  startCalibration() {
    calibBuffer = [];
    calibMode = true;
  },

  // Para a calibração
  stopCalibration() {
    calibMode = false;
    return [...calibBuffer];
  },

  //Devolve só os últimos n pontos de cada buffer (emg/imu), evitando copiar o array todo
  getRecentBuffers(n) {
    return {
      emgBuffer: emgBuffer.slice(-n),
      imuBuffer: imuBuffer.slice(-n),
    };
  },

  // Regista um callback a ser chamado sempre que chega um frame/linha do módulo
  addListener(id, callback) {
    listeners.set(id, callback);
  },
  
  // Remove o callback registado em addListener() com o mesmo id
  removeListener(id) {
    listeners.delete(id);
  },

  // Callback chamado só quando a ligação cai de forma inesperada
  addCloseListener(id, callback) {
    closeListeners.set(id, callback);
  },

  // Remove o callback registado em addCloseListener() com o mesmo id
  removeCloseListener(id) {
    closeListeners.delete(id);
  },

  // Se há socket ativo
  isConnected() {
    return socket !== null;
  },

  // Se está a decorrer uma monitorização ou calibração
  isMonitoring() {
    return monitoring || calibMode;
  },
};

export default moduleService;