/**
 * moduleService.js
 * Serviço singleton para comunicação com o módulo ESP32 via socket TCP em bruto.
 *
 * O firmware do ESP32 NÃO fala HTTP nem WebSocket — é um WiFiServer(1234) simples:
 *  - Comandos enviados como texto terminado em '\n' (ex: "EMG\n", "POT\n", "2500\n")
 *  - Resposta em modo IMU/POT: linhas de texto terminadas em '\n'
 *  - Resposta em modo EMG/DUAL: frames binários, cada um começando com
 *    a palavra de sincronismo SYNC = 0xDEADBEEF (4 bytes, little-endian)
 *
 * ⚠️ ASSUNÇÃO A CONFIRMAR: o layout exato dos campos dentro do frame binário
 * (o que são os 2+2+2+4 bytes de cabeçalho a seguir ao SYNC, e se as amostras
 * IMU são floats de 4 bytes x2 ou doubles de 8 bytes) não está confirmado
 * aqui — só sei os TAMANHOS totais pelo código do ESP32. Ajusta as constantes
 * marcadas com "TODO" abaixo assim que confirmares o formato exato do lado
 * da STM32.
 */

import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';

const MODULE_IP   = '192.168.4.1';
const MODULE_PORT = 1234;

// ─── Constantes do protocolo (espelham o firmware ESP32) ─────────────────────
const SYNC_BYTES   = 4;                 // SYNC = 0xDEADBEEF
const HEADER_BYTES = 2 + 2 + 2 + 4;     // TODO: confirmar layout exato destes campos
const NSAMP        = 256;               // amostras EMG por frame (uint16 cada)
const EMG_BYTES    = NSAMP * 2;
const TRAILER_BYTES = 2;
const MAX_IMU_SAMP = 26;
const SYNC_WORD    = 0xDEADBEEF;

// ─── Estado interno ───────────────────────────────────────────────────────────
let socket        = null;
let listeners     = new Map();   // id → callback(rawData, parsedData)
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;

let currentMode   = 'IDLE';      // 'EMG' | 'IMU' | 'DUAL' | 'IDLE' — espelha o modo pedido
let imuSamp       = 6;           // espelha o imu_samp calculado no ESP32 (default inicial)
let frameSize     = HEADER_BYTES + SYNC_BYTES + (imuSamp * 8) + EMG_BYTES + TRAILER_BYTES;

let recvBuffer    = Buffer.alloc(0);   // buffer de receção acumulado (para frames binários)
let textLineBuf   = '';                // buffer de linha (para modo texto IMU/POT)

// ─── Helpers de frequência (espelha cálculo do firmware) ─────────────────────
function updateFrameSizeForFreq(hz) {
  // Mesma fórmula usada no ESP32 para recalcular imu_samp a partir da frequência
  const prescaler = Math.round((280e6) / (27 * hz));
  const freq = (280e6) / (prescaler * 27.0);
  let samp = Math.floor(25600 / freq);
  if (samp < 1) samp = 1;
  if (samp > MAX_IMU_SAMP) samp = MAX_IMU_SAMP;
  imuSamp = samp;
  frameSize = HEADER_BYTES + SYNC_BYTES + (imuSamp * 8) + EMG_BYTES + TRAILER_BYTES;
}

// ─── Parsing de frames binários (EMG/DUAL) ───────────────────────────────────
function tryParseBinaryFrames(onData) {
  while (true) {
    const syncIdx = recvBuffer.indexOf(
      Buffer.from([
        SYNC_WORD & 0xff,
        (SYNC_WORD >> 8) & 0xff,
        (SYNC_WORD >> 16) & 0xff,
        (SYNC_WORD >> 24) & 0xff,
      ])
    );
    if (syncIdx === -1) {
      // sem SYNC ainda — mantém só os últimos bytes (podem ser início de um SYNC cortado)
      if (recvBuffer.length > SYNC_BYTES) {
        recvBuffer = recvBuffer.slice(recvBuffer.length - (SYNC_BYTES - 1));
      }
      return;
    }
    // descarta lixo antes do SYNC
    if (syncIdx > 0) recvBuffer = recvBuffer.slice(syncIdx);

    if (recvBuffer.length < frameSize) return; // ainda não chegou o frame completo

    const frame = recvBuffer.slice(0, frameSize);
    recvBuffer = recvBuffer.slice(frameSize);

    // TODO: confirmar offsets exatos do cabeçalho — assume-se aqui:
    // [0:4]=SYNC  [4:HEADER_BYTES+4]=header (ignorado por agora)
    let offset = SYNC_BYTES + HEADER_BYTES;

    // Amostras IMU: assume-se 2 floats de 4 bytes (x,y ou eixo) por amostra — AJUSTAR se necessário
    const imuSamples = [];
    for (let i = 0; i < imuSamp; i++) {
      const a = frame.readFloatLE(offset);      offset += 4;
      const b = frame.readFloatLE(offset);      offset += 4;
      imuSamples.push([a, b]);
    }

    // Amostras EMG: uint16 little-endian
    const emgSamples = [];
    for (let i = 0; i < NSAMP; i++) {
      emgSamples.push(frame.readUInt16LE(offset));
      offset += 2;
    }
    // offset += TRAILER_BYTES; // trailer ignorado

    if (calibMode) {
      calibBuffer.push(...emgSamples);
    }
    if (monitoring) {
      emgBuffer.push(...emgSamples);
      if (imuSamples.length) imuBuffer.push(...imuSamples);
    }

    const parsed = { type: 'FRAME', emg: emgSamples, imu: imuSamples };
    listeners.forEach((cb) => cb(frame, parsed));
    onData && onData(frame, parsed);
  }
}

// ─── Parsing de linhas de texto (IMU/POT) ────────────────────────────────────
function parseTextLine(line, onData) {
  const str = line.trim();
  let parsed;
  if (str.startsWith('IMU:')) {
    const parts = str.slice(4).split(',').map(parseFloat);
    parsed = { type: 'IMU', value: parts };
    if (monitoring) imuBuffer.push(parts);
  } else {
    const num = parseFloat(str);
    parsed = isNaN(num) ? { type: 'TEXT', value: str } : { type: 'EMG', value: num };
    if (!isNaN(num)) {
      if (calibMode) calibBuffer.push(num);
      if (monitoring) emgBuffer.push(num);
    }
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
    // modo texto (IMU/POT/IDLE) — linhas terminadas em '\n'
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
  /**
   * Verifica se o módulo está acessível (tenta abrir ligação TCP, timeout 5s).
   * Retorna true se conseguir ligar, false caso contrário.
   */
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

  /**
   * Abre a ligação TCP persistente com o módulo.
   * @param {object} callbacks - { onOpen, onClose, onError, onData }
   */
  connect({ onOpen, onClose, onError, onData } = {}) {
    if (socket) {
      onOpen && onOpen();
      return;
    }

    recvBuffer = Buffer.alloc(0);
    textLineBuf = '';

    try {
      socket = TcpSocket.createConnection(
        { port: MODULE_PORT, host: MODULE_IP },
        () => {
          console.log('[ModuleService] TCP ligado');
          onOpen && onOpen();
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

  /** Fecha a ligação TCP. */
  disconnect() {
    if (socket) {
      socket.destroy();
      socket = null;
    }
    currentMode = 'IDLE';
  },

  /**
   * Envia um comando (string) para o módulo, terminado em '\n'.
   * @param {string|number} cmd - Comando ou valor a enviar
   * @returns {boolean} - true se enviado com sucesso
   */
  sendCommand(cmd) {
    if (!socket) {
      console.warn('[ModuleService] Não foi possível enviar — socket não ligado');
      return false;
    }
    const str = String(cmd);

    // Espelha localmente o modo pedido, para saber como interpretar as respostas
    const upper = str.toUpperCase();
    if (['EMG', 'IMU', 'DUAL', 'IDLE', 'POT', 'FREQ'].includes(upper)) {
      currentMode = upper === 'POT' || upper === 'FREQ' ? currentMode : upper;
    }

    socket.write(str + '\n');
    return true;
  },

  /**
   * Define a frequência de amostragem: envia os comandos FREQ ao módulo
   * e atualiza o frameSize local para acompanhar o imu_samp recalculado no ESP32.
   * Usa isto em vez de sendCommand('FREQ') + sendCommand(valor) diretamente.
   */
  setFrequency(hz) {
    const freqValue = Math.round((280e6) / (27 * hz));
    this.sendCommand('FREQ');
    this.sendCommand(String(freqValue));
    updateFrameSizeForFreq(hz);
    return freqValue;
  },

  /** Inicia monitorização: limpa buffers e envia o modo (EMG/IMU/DUAL). */
  startMonitoring(mode) {
    emgBuffer = [];
    imuBuffer = [];
    monitoring = true;
    this.sendCommand(mode);
  },

  /**
   * Para monitorização: envia IDLE e retorna os buffers recolhidos.
   * @returns {{ emgBuffer: number[], imuBuffer: number[][] }}
   */
  stopMonitoring() {
    monitoring = false;
    this.sendCommand('IDLE');
    return {
      emgBuffer: [...emgBuffer],
      imuBuffer: [...imuBuffer],
    };
  },

  /** Inicia modo calibração: limpa buffer de calib. */
  startCalibration() {
    calibBuffer = [];
    calibMode = true;
  },

  /**
   * Termina modo calibração e retorna o buffer recolhido.
   * @returns {number[]}
   */
  stopCalibration() {
    calibMode = false;
    return [...calibBuffer];
  },

  /** Retorna cópias dos buffers actuais. */
  getBuffers() {
    return {
      emgBuffer: [...emgBuffer],
      imuBuffer: [...imuBuffer],
    };
  },

  /**
   * Regista um listener para dados recebidos.
   * @param {string} id - Identificador único do listener
   * @param {function} callback - (rawData, parsedData) => void
   */
  addListener(id, callback) {
    listeners.set(id, callback);
  },

  /** Remove um listener pelo ID. */
  removeListener(id) {
    listeners.delete(id);
  },

  /** Verdadeiro se o socket TCP está aberto. */
  isConnected() {
    return socket !== null;
  },

  /** Estado da ligação: 'disconnected' | 'connected' */
  getStatus() {
    return socket !== null ? 'connected' : 'disconnected';
  },
};

export default moduleService;