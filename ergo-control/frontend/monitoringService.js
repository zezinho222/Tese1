/**
 * monitoringService.js
 * Estado da monitorização em curso (gráfico, alertas, duração), vivendo fora
 * do MonitoringPage — um singleton, tal como moduleService/syncService.
 *
 * Antes, todo este estado (timers, buffers de gráfico, contagem de alertas,
 * sessão em curso) vivia dentro do componente MonitoringPage. Ao navegar
 * para outro ecrã (ex: seta de "voltar"), o componente desmontava e o
 * cleanup (useEffect de retorno) parava os intervalos — a monitorização
 * "morria" silenciosamente: parava de detetar alertas, de notificar, e a
 * sessão ficava por terminar/guardar corretamente. Vivendo aqui, o
 * utilizador pode navegar à vontade pela app que a monitorização (e as
 * notificações de alerta) continuam a funcionar; o MonitoringPage passa a
 * ser só uma "vista" que subscreve este estado.
 */
import syncService from './syncService';
import moduleService from './moduleService';
import notificationService from './notificationService';
import { createAlertTracker } from './utils/alertTracker';
import { computeRmsEnvelope, DEFAULT_WINDOW_MS, DEFAULT_OVERLAP_MS } from './utils/emgProcessing';

const REFRESH_MS     = 1000; // intervalo de atualização do gráfico
const DISPLAY_POINTS = 20;  // quantos pontos mostrar no gráfico

const IMU_ALERT_DEG     = 45;  // graus de pitch/roll acima dos quais é má postura
const ALERT_DEBOUNCE_MS = 700; // tempo mínimo acima do limite para contar como 1 alerta

const IDLE_STATE = {
  isMonitoring: false,
  elapsedSec: 0,
  alertCount: 0,
  emgPoints: [],
  imuPoints: [],
};

let state = { ...IDLE_STATE };
let listeners = new Set(); // callbacks(state) — ecrãs atualmente montados a ouvir

let sessionId   = null;
let mvcValue    = null; // usado no fim para normalizar o sinal (norm_signal = raw / mvc)
let fsValue     = null; // frequência de amostragem em Hz (freqHz do módulo)
let tokenGetter = () => null;

let elapsedInterval = null;
let graphInterval   = null;
let imuAlertTracker = null;

function notify() {
  const snapshot = { ...state };
  listeners.forEach((cb) => cb(snapshot));
}

/** Chamado pelas páginas ao montar — devolve a função de unsubscribe. */
function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getState() {
  return { ...state };
}

/**
 * Inicia uma monitorização. Assume que quem chama (MonitoringPage) já
 * validou que há módulo ligado, calibrado (se necessário) e conectado —
 * essas verificações continuam a ser responsabilidade do ecrã, só a
 * execução em si (timers, deteção de alertas, sessão) vive aqui.
 */
async function start({ sensorType, mvc, fs, token }) {
  if (state.isMonitoring) return;

  mvcValue    = mvc ?? null;
  fsValue     = fs ?? null;
  tokenGetter = () => token;

  state = { ...IDLE_STATE, isMonitoring: true };
  imuAlertTracker = createAlertTracker(ALERT_DEBOUNCE_MS);

  // Regista a sessão sempre localmente primeiro — funciona mesmo sem internet
  // (estás ligado à Wi-Fi do módulo, sem acesso à internet, durante a monitorização)
  const now = new Date();
  sessionId = await syncService.queueNewSession({
    sensorType,
    startTime: now.toISOString(),
    mvc: mvcValue,
  });

  // Inicia monitorização no serviço (envia EMG / IMU / DUAL) ANTES de
  // tentar sincronizar — trySyncAll desliga o módulo quando há internet
  // e não está a monitorizar; chamá-lo antes disto podia desligar o
  // módulo mesmo depois de reconectado, antes de começar a receber dados.
  moduleService.startMonitoring(sensorType);

  // Tentativa de sincronização em segundo plano — não bloqueia nem falha visivelmente
  // se não houver internet; o listener em App.js trata disso mais tarde.
  syncService.trySyncAll(token);

  elapsedInterval = setInterval(() => {
    state.elapsedSec += 1;
    notify();
  }, 1000);

  graphInterval = setInterval(() => {
    const { emgBuffer, imuBuffer } = moduleService.getRecentBuffers(DISPLAY_POINTS);
    state.emgPoints = emgBuffer;
    state.imuPoints = imuBuffer;

    // Um alerta só conta quando o valor se mantém acima do limite durante
    // ALERT_DEBOUNCE_MS seguidos — um episódio contínuo = 1 alerta, não
    // um por cada amostra (ver utils/alertTracker.js).
    const nowMs = Date.now();

    if (imuBuffer.length > 0) {
      const [pitch, roll] = imuBuffer[imuBuffer.length - 1];
      const badPosture = Math.abs(pitch) > IMU_ALERT_DEG || Math.abs(roll) > IMU_ALERT_DEG;
      if (imuAlertTracker?.update(badPosture, nowMs)) {
        state.alertCount += 1;
        notificationService.notifyAlert('imu');
      }
    }

    notify();
  }, REFRESH_MS);

  notify();
}

/**
 * Para a monitorização em curso e guarda a sessão (local + backend).
 * Seguro chamar mesmo sem monitorização ativa.
 *
 * A janela e o overlap do envelope RMS são escolhidos pelo utilizador no
 * pop-up que aparece depois de confirmar a paragem (ver MonitoringPage).
 * Quando stop() é chamado sem argumentos — por exemplo pela paragem
 * automática ao perder a ligação ao módulo — usam-se os valores por omissão.
 *
 * @param {{ windowMs?: number, overlapMs?: number }} [envelopeOpts]
 */
async function stop({ windowMs = DEFAULT_WINDOW_MS, overlapMs = DEFAULT_OVERLAP_MS } = {}) {
  if (!state.isMonitoring) return null;

  clearInterval(elapsedInterval);
  clearInterval(graphInterval);

  const { emgBuffer, imuBuffer } = moduleService.stopMonitoring(); // envia IDLE internamente (falha em silêncio se já não há ligação)

  const endTime  = new Date();
  const duration = state.elapsedSec;
  const alertCount = state.alertCount;

  // ── Envelope RMS ──────────────────────────────────────────────────────────
  // Calculado uma única vez aqui, no fim da sessão, a partir do sinal em
  // bruto: normaliza-se pelo MVC (raw / mvc) e corre-se a janela deslizante
  // com o salto pedido. Fica guardado com a sessão, para o histórico e o
  // export não terem de o recalcular.
  //   nº amostras da janela = windowMs/1000 * fs
  //   nº amostras do salto  = (windowMs - overlapMs)/1000 * fs
  const fs = fsValue || (duration > 0 ? Math.round(emgBuffer.length / duration) : 0);
  const env = computeRmsEnvelope(emgBuffer, {
    mvc: mvcValue,
    fs,
    windowMs,
    overlapMs,
  });

  // Atualiza a sessão local com os dados finais — sempre grava, mesmo offline.
  // emgData grava-se em bruto (todas as amostras recolhidas, sem downsample)
  // para o export CSV refletir exatamente o que foi recolhido (freq × duração
  // amostras); o buffer IMU continua reduzido, pois só serve para o gráfico.
  if (sessionId) {
    await syncService.queueSessionEnd(sessionId, {
      endTime:    endTime.toISOString(),
      duration,
      mvc:        mvcValue,
      alertCount,
      emgData:    emgBuffer,
      imuData:    syncService.downsampleArray(imuBuffer),
      envelope:   env.envelope,
      envelopeParams: {
        windowMs:      env.windowMs,
        overlapMs:     env.overlapMs,
        fs:            env.fs,
        windowSamples: env.windowSamples,
        hopSamples:    env.hopSamples,
      },
    });
    syncService.trySyncAll(tokenGetter());
  }

  sessionId = null;
  state = { ...IDLE_STATE };
  notify();

  // Devolvido para o ecrã poder mostrar logo o resultado (pico, média, nº de
  // janelas) sem ter de ir buscar a sessão outra vez.
  return env;
}

// Paragem automática ao perder a ligação ao módulo a meio da sessão —
// registado uma única vez aqui (não num componente), para funcionar mesmo
// que o utilizador já não esteja no ecrã de Monitorização quando a Wi-Fi do
// módulo cai. A notificação "Módulo desligou-se" já é global (ver App.js);
// aqui só tratamos de parar e guardar a sessão em curso.
moduleService.addCloseListener('monitoringService', () => {
  if (!state.isMonitoring) return;
  stop();
});

export default {
  start,
  stop,
  subscribe,
  getState,
};