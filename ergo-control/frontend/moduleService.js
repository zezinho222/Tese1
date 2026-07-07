/**
 * moduleService.js
 * Serviço singleton para comunicação com o módulo ESP32 via WebSocket.
 *
 * Protocolo assumido (ajustar conforme firmware do ESP32):
 *  - Dados EMG:  mensagem com número puro, ex: "1234.5"
 *  - Dados IMU:  mensagem com prefixo, ex: "IMU:1.2,3.4,5.6"
 *  - Modo DUAL:  mensagem com prefixo, ex: "EMG:1234.5" ou "IMU:1.2,3.4,5.6"
 */

import WifiManager from 'react-native-wifi-reborn';

const MODULE_IP   = '192.168.4.1';
const MODULE_PORT = 1234;
const WS_URL      = `ws://${MODULE_IP}:${MODULE_PORT}/ws`;

// ─── Estado interno ───────────────────────────────────────────────────────────
let ws            = null;
let listeners     = new Map();   // id → callback(rawData)
let emgBuffer     = [];          // buffer de monitorização EMG
let imuBuffer     = [];          // buffer de monitorização IMU
let calibBuffer   = [];          // buffer exclusivo da calibração
let monitoring    = false;
let calibMode     = false;
let wifiForced    = false;       // se já forçámos o uso da wifi do módulo

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

/**
 * Força o Android a encaminhar o tráfego de rede do processo pela
 * Wi-Fi do módulo, mesmo que o sistema a marque como "sem internet".
 * Sem isto, fetch()/WebSocket para 192.168.4.1 pode falhar mesmo
 * estando fisicamente ligado à rede do ESP32.
 *
 * NOTA: usamos forceWifiUsageWithOptions (em vez do forceWifiUsage,
 * que está depreciado) com { noInternet: true }, que é a forma
 * correta de indicar ao Android que o ponto de acesso não tem
 * internet — sem isto, alguns telemóveis (Samsung, Xiaomi, etc.)
 * ignoram o bind e voltam a marcar a rede como inutilizável.
 */
async function bindToModuleWifi() {
  try {
    await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
    wifiForced = true;
    console.log('[ModuleService] forceWifiUsageWithOptions(true) OK — tráfego a sair pela wifi do módulo');
  } catch (e) {
    wifiForced = false;
    console.log('[ModuleService] forceWifiUsageWithOptions(true) falhou:', e);
  }
}

/**
 * Reverte o forceWifiUsage, devolvendo o tráfego normal da app
 * à rede com internet (dados móveis / outra Wi-Fi).
 * Deve ser chamado sempre que se desliga do módulo.
 */
async function releaseModuleWifi() {
  if (!wifiForced) return;
  try {
    await WifiManager.forceWifiUsageWithOptions(false, { noInternet: true });
  } catch (e) {
    console.log('[ModuleService] forceWifiUsageWithOptions(false) falhou:', e);
  } finally {
    wifiForced = false;
  }
}

// ─── Módulo público ───────────────────────────────────────────────────────────
const moduleService = {
  /**
   * Verifica se o módulo está acessível na rede.
   * Usa um handshake WebSocket real (em vez de um fetch HTTP) porque o
   * ESP32 tipicamente só expõe um servidor WebSocket nesta porta — não
   * responde a um GET HTTP normal, o que fazia o teste antigo falhar
   * mesmo com o módulo acessível e a rede certa.
   * Retorna true se o WebSocket abrir dentro do timeout, false caso contrário.
   */
  async isModuleReachable() {
    await bindToModuleWifi();

    if (!wifiForced) {
      console.log('[ModuleService] Aviso: não foi possível forçar o uso da wifi do módulo — a ligação seguinte pode falhar mesmo com o módulo acessível.');
    }

    return new Promise((resolve) => {
      let settled = false;
      let testWs;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.log('[ModuleService] Teste de alcançabilidade a', WS_URL, 'expirou (timeout)');
        testWs?.close();
        resolve(false);
      }, 5000);

      try {
        testWs = new WebSocket(WS_URL);

        testWs.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          testWs.close();
          resolve(true);
        };

        testWs.onerror = (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          console.log('[ModuleService] Teste de alcançabilidade a', WS_URL, 'falhou:', e?.message || e);
          resolve(false);
        };
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.log('[ModuleService] Falha ao criar WebSocket de teste:', e);
        resolve(false);
      }
    });
  },

  /**
   * Abre a ligação WebSocket com o módulo.
   * @param {object} callbacks - { onOpen, onClose, onError, onData }
   */
  async connect({ onOpen, onClose, onError, onData } = {}) {
    // Se já está ligado, chama onOpen e sai
    if (ws && ws.readyState === 1 /* OPEN */) {
      onOpen && onOpen();
      return;
    }
    // Se está a ligar, aguarda
    if (ws && ws.readyState === 0 /* CONNECTING */) {
      return;
    }

    // Garante que o pedido de WebSocket sai pela wifi do módulo
    await bindToModuleWifi();

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

  /**
   * Fecha a ligação WebSocket e devolve o tráfego de rede ao normal
   * (dados móveis / wifi com internet).
   */
  async disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    await releaseModuleWifi();
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