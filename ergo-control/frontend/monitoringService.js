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
import { normalizeByMVC } from './utils/emgProcessing';
import { createAlertTracker } from './utils/alertTracker';

const REFRESH_MS     = 300; // intervalo de atualização do gráfico
const DISPLAY_POINTS = 20;  // quantos pontos mostrar no gráfico

const EMG_ALERT_MVC_PCT = 80;  // % do MVC calibrado acima do qual é esforço excessivo
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
let mvcValue    = null;
let tokenGetter = () => null;

let elapsedInterval = null;
let graphInterval   = null;
let emgAlertTracker = null;
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
async function start({ sensorType, mvc, token }) {
  if (state.isMonitoring) return;

  mvcValue    = mvc ?? null;
  tokenGetter = () => token;

  state = { ...IDLE_STATE, isMonitoring: true };
  emgAlertTracker = createAlertTracker(ALERT_DEBOUNCE_MS);
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
    const { emgBuffer, imuBuffer } = moduleService.getBuffers();
    state.emgPoints = emgBuffer.slice(-DISPLAY_POINTS);
    state.imuPoints = imuBuffer.slice(-DISPLAY_POINTS);

    // Um alerta só conta quando o valor se mantém acima do limite durante
    // ALERT_DEBOUNCE_MS seguidos — um episódio contínuo = 1 alerta, não
    // um por cada amostra (ver utils/alertTracker.js).
    const nowMs = Date.now();

    if (emgBuffer.length > 0 && mvcValue) {
      const lastEmg = emgBuffer[emgBuffer.length - 1];
      const pct = normalizeByMVC(lastEmg, mvcValue);
      if (emgAlertTracker?.update(pct >= EMG_ALERT_MVC_PCT, nowMs)) {
        state.alertCount += 1;
        notificationService.notifyAlert('emg');
      }
    }

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

/** Para a monitorização em curso e guarda a sessão (local + backend). Seguro chamar mesmo sem monitorização ativa. */
async function stop() {
  if (!state.isMonitoring) return;

  clearInterval(elapsedInterval);
  clearInterval(graphInterval);

  const { emgBuffer, imuBuffer } = moduleService.stopMonitoring(); // envia IDLE internamente (falha em silêncio se já não há ligação)

  const endTime  = new Date();
  const duration = state.elapsedSec;
  const alertCount = state.alertCount;

  // Atualiza a sessão local com os dados finais — sempre grava, mesmo offline.
  // Os buffers são reduzidos (downsample) antes de guardar, para não gravar
  // sessões inteiras ao segundo (podem ter milhares de amostras).
  if (sessionId) {
    await syncService.queueSessionEnd(sessionId, {
      endTime:    endTime.toISOString(),
      duration,
      mvc:        mvcValue,
      alertCount,
      emgData:    syncService.downsampleArray(emgBuffer),
      imuData:    syncService.downsampleArray(imuBuffer),
    });
    syncService.trySyncAll(tokenGetter());
  }

  sessionId = null;
  state = { ...IDLE_STATE };
  notify();
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
