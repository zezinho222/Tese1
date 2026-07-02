/**
 * moduleService.js
 * Serviço singleton para comunicação com o módulo ESP32 via WebSocket.
 *
 * Protocolo assumido (ajustar conforme firmware do ESP32):
 *  - Dados EMG:  mensagem com número puro, ex: "1234.5"
 *  - Dados IMU:  mensagem com prefixo, ex: "IMU:1.2,3.4,5.6"
 *  - Modo DUAL:  mensagem com prefixo, ex: "EMG:1234.5" ou "IMU:1.2,3.4,5.6"
 */

const MODULE_IP  = '192.168.4.1';
const WS_URL     = `ws://${MODULE_IP}/ws`;
const HTTP_URL   = `http://${MODULE_IP}`;

// ─── Estado interno ───────────────────────────────────────────────────────────
let ws            = null;
let listeners     = new Map();   // id → callback(rawData)
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseMessage(raw) {
  const str = String(raw);
  if (str.startsWith('EMG:')) {
    return { type: 'EMG', value: parseFloat(str.slice(4)) };
  }
  if (str.startsWith('IMU:')) {
    const parts = str.slice(4).split(',').map(parseFloat);
    return { type: 'IMU', value: parts };
  }
  // Sem prefixo: trata como EMG
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return { type: 'EMG', value: num };
  }
  return { type: 'TEXT', value: str };
}

// ─── Módulo público ───────────────────────────────────────────────────────────
const moduleService = {
  /**
   * Verifica se o módulo está acessível na rede (HTTP ping com timeout de 5s).
   * Retorna true se o módulo responder, false caso contrário.
   */
  async isModuleReachable() {
    let timeoutId;
    const controller = new AbortController();
    try {
      timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(HTTP_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      return true;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  },

  /**
   * Abre a ligação WebSocket com o módulo.
   * @param {object} callbacks - { onOpen, onClose, onError, onData }
   */
  connect({ onOpen, onClose, onError, onData } = {}) {
    // Se já está ligado, chama onOpen e sai
    if (ws && ws.readyState === 1 /* OPEN */) {
      onOpen && onOpen();
      return;
    }
    // Se está a ligar, aguarda
    if (ws && ws.readyState === 0 /* CONNECTING */) {
      return;
    }

    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[ModuleService] WebSocket ligado');
        onOpen && onOpen();
      };

      ws.onmessage = (event) => {
        const raw = event.data;
        const parsed = parseMessage(raw);

        // Buffer de calibração (tem prioridade)
        if (calibMode && parsed.type === 'EMG' && !isNaN(parsed.value)) {
          calibBuffer.push(parsed.value);
        }

        // Buffer de monitorização
        if (monitoring) {
          if (parsed.type === 'EMG' && !isNaN(parsed.value)) {
            emgBuffer.push(parsed.value);
          }
          if (parsed.type === 'IMU' && Array.isArray(parsed.value)) {
            imuBuffer.push(parsed.value);
          }
        }

        // Notifica todos os listeners registados
        listeners.forEach((cb) => cb(raw, parsed));
        onData && onData(raw, parsed);
      };

      ws.onclose = () => {
        console.log('[ModuleService] WebSocket fechado');
        ws = null;
        onClose && onClose();
      };

      ws.onerror = (e) => {
        console.log('[ModuleService] Erro WebSocket:', e.message);
        onError && onError(e);
      };
    } catch (e) {
      console.log('[ModuleService] Falha ao criar WebSocket:', e);
      onError && onError(e);
    }
  },

  /** Fecha a ligação WebSocket. */
  disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
  },

  /**
   * Envia um comando (string) para o módulo.
   * @param {string|number} cmd - Comando ou valor a enviar
   * @returns {boolean} - true se enviado com sucesso
   */
  sendCommand(cmd) {
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(String(cmd));
      return true;
    }
    console.warn('[ModuleService] Não foi possível enviar — WebSocket não ligado');
    return false;
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
   * Regista um listener para mensagens WebSocket.
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

  /** Verdadeiro se o WebSocket está aberto. */
  isConnected() {
    return ws !== null && ws.readyState === 1;
  },

  /** Estado da ligação: 'disconnected' | 'connecting' | 'connected' | 'closing' */
  getStatus() {
    if (!ws) return 'disconnected';
    switch (ws.readyState) {
      case 0: return 'connecting';
      case 1: return 'connected';
      case 2: return 'closing';
      case 3: return 'disconnected';
      default: return 'disconnected';
    }
  },
};

export default moduleService;