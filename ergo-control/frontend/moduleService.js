/**
 * moduleService.js
 * Serviço singleton para comunicação com o módulo (STM32 + ESP32) via socket TCP em bruto.
 *
 * Protocolo confirmado a partir do firmware STM32 (main.c):
 *
 *  MODO IMU (texto, sem prefixo):
 *    "<pitch>, <roll>\n"   (dois floats separados por vírgula)
 *
 *  MODO EMG (binário — EmgFrame packed, SYNC no byte 0):
 *    SYNC(4) + sensor_id(1) + seq(2) + nsamp(2) + timestamp(4)
 *    + data[nsamp](nsamp×2) + battery(2) + crc(2)
 *
 *  MODO DUAL (binário — construído em build_dual_packet, sensor_id ANTES do SYNC):
 *    sensor_id(1) + SYNC(4) + seq(2) + nsamp(2) + imu_samp(2) + timestamp(4)
 *    + Pitch[imu_samp](×4) + Roll[imu_samp](×4) + data[nsamp](×2) + battery(2) + crc(2)
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

// Modo EMG: SYNC(4) + sensor_id(1) + seq(2) + nsamp(2) + timestamp(4) = 13 bytes até aos dados
const EMG_HEADER_BYTES  = 4 + 1 + 2 + 2 + 4; // 13
const EMG_TRAILER_BYTES = 2 + 2;             // battery + crc

// Modo DUAL: sensor_id(1) + SYNC(4) + seq(2) + nsamp(2) + imu_samp(2) + timestamp(4) = 15 bytes até aos dados
const DUAL_PRE_SYNC_BYTES         = 1;        // sensor_id, vem ANTES do SYNC
const DUAL_HEADER_AFTER_SYNC_BYTES = 2 + 2 + 2 + 4; // seq+nsamp+imu_samp+timestamp = 10
const DUAL_TRAILER_BYTES          = 2 + 2;    // battery + crc

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

    if (currentMode === 'DUAL') {
      // No modo DUAL, o sensor_id vem 1 byte ANTES do SYNC.
      if (syncIdx < DUAL_PRE_SYNC_BYTES) {
        return; // ainda não recebemos esse byte — espera mais dados
      }
      const frameStart = syncIdx - DUAL_PRE_SYNC_BYTES;
      if (frameStart > 0) recvBuffer = recvBuffer.slice(frameStart);

      const minHeader = DUAL_PRE_SYNC_BYTES + SYNC_BYTES + DUAL_HEADER_AFTER_SYNC_BYTES;
      if (recvBuffer.length < minHeader) return; // cabeçalho ainda incompleto

      let off = DUAL_PRE_SYNC_BYTES + SYNC_BYTES; // salta sensor_id + SYNC
      off += 2; // seq (não usado)
      const nsamp   = recvBuffer.readUInt16LE(off); off += 2;
      const imusamp = recvBuffer.readUInt16LE(off); off += 2;
      off += 4; // timestamp (não usado)

      const frameLen = DUAL_PRE_SYNC_BYTES + SYNC_BYTES + DUAL_HEADER_AFTER_SYNC_BYTES
                      + imusamp * 4   // Pitch
                      + imusamp * 4   // Roll
                      + nsamp * 2     // amostras EMG
                      + DUAL_TRAILER_BYTES;

      if (recvBuffer.length < frameLen) return; // frame ainda incompleto — espera mais dados
      const frame = recvBuffer.slice(0, frameLen);
      recvBuffer = recvBuffer.slice(frameLen);

      let dataOff = DUAL_PRE_SYNC_BYTES + SYNC_BYTES + DUAL_HEADER_AFTER_SYNC_BYTES;
      const pitchArr = [];
      for (let i = 0; i < imusamp; i++) { pitchArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      const rollArr = [];
      for (let i = 0; i < imusamp; i++) { rollArr.push(frame.readFloatLE(dataOff)); dataOff += 4; }
      const emgArr = [];
      for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }
      // battery/crc seguem-se, mas não são precisos para os gráficos

      const imuSamples = pitchArr.map((p, i) => [p, rollArr[i]]); // [pitch, roll]

      if (calibMode) calibBuffer.push(...emgArr);
      if (monitoring) {
        emgBuffer.push(...emgArr);
        imuBuffer.push(...imuSamples);
      }

      const parsed = { type: 'FRAME', emg: emgArr, imu: imuSamples };
      listeners.forEach((cb) => cb(frame, parsed));
      onData && onData(frame, parsed);

    } else {
      // Modo EMG: o SYNC está mesmo no início do frame (offset 0)
      if (syncIdx > 0) recvBuffer = recvBuffer.slice(syncIdx);

      // Precisamos de pelo menos SYNC(4)+sensor_id(1)+seq(2)+nsamp(2) para ler o nsamp
      if (recvBuffer.length < SYNC_BYTES + 1 + 2 + 2) return;

      const nsamp = recvBuffer.readUInt16LE(SYNC_BYTES + 1 + 2); // offset 7

      const frameLen = EMG_HEADER_BYTES + nsamp * 2 + EMG_TRAILER_BYTES;
      if (recvBuffer.length < frameLen) return;

      const frame = recvBuffer.slice(0, frameLen);
      recvBuffer = recvBuffer.slice(frameLen);

      let dataOff = EMG_HEADER_BYTES;
      const emgArr = [];
      for (let i = 0; i < nsamp; i++) { emgArr.push(frame.readUInt16LE(dataOff)); dataOff += 2; }

      if (calibMode) calibBuffer.push(...emgArr);
      if (monitoring) emgBuffer.push(...emgArr);

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
          console.log('[ModuleService] TCP ligado');

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
    }
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

  addListener(id, callback) {
    listeners.set(id, callback);
  },

  removeListener(id) {
    listeners.delete(id);
  },

  isConnected() {
    return socket !== null;
  },

  getStatus() {
    return socket !== null ? 'connected' : 'disconnected';
  },
};

export default moduleService;