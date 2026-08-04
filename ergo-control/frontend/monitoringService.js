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
import { computeRmsEnvelope } from './utils/emgProcessing';

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
let mvcValue    = null; // só guardado com a sessão para referência histórica — já não é usado para calcular %MVC durante a monitorização
let fsValue     = null; // frequência de amostragem (Hz) — usada no cálculo do envelope RMS ao parar
let tokenGetter = () => null;

let elapsedInterval = null;
let graphInterval   = null;
let imuAlertTracker = null;

// Dados capturados por stopCapture() — a monitorização já está parada nesta
// altura (módulo desligado, timers limpos), só falta o envelope (que precisa
// da janela/overlap escolhidos no pop-up) para finishSession() gravar a
// sessão. Ver comentário em stopCapture().
let pendingStop = null;

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
 * Para a monitorização de facto (desliga o módulo, limpa os timers, congela
 * o gráfico) — sem ainda calcular o envelope nem gravar a sessão. Chamado
 * assim que o utilizador confirma a paragem, ANTES do pop-up da janela/
 * overlap aparecer, para a monitorização parar logo, sem esperar pela
 * escolha desses valores. Os dados ficam guardados em `pendingStop` até
 * finishSession() ser chamado. Seguro chamar mesmo sem monitorização ativa.
 */
function stopCapture() {
  if (!state.isMonitoring) return;

  clearInterval(elapsedInterval);
  clearInterval(graphInterval);

  const { emgBuffer, imuBuffer } = moduleService.stopMonitoring(); // envia IDLE internamente (falha em silêncio se já não há ligação)

  pendingStop = {
    emgBuffer,
    imuBuffer,
    endTime:    new Date(),
    duration:   state.elapsedSec,
    alertCount: state.alertCount,
  };

  state = { ...IDLE_STATE };
  notify();
}

/**
 * Calcula o envelope RMS (com a janela/overlap escolhidos no pop-up) sobre
 * os dados capturados por stopCapture() e grava a sessão (local + backend).
 * Seguro chamar mesmo sem paragem pendente.
 * @param {object} [opts]
 * @param {number} [opts.windowMs]  - largura da janela do envelope RMS (ms)
 * @param {number} [opts.overlapMs] - overlap do envelope RMS (ms)
 * @returns {object|undefined} resultado de computeRmsEnvelope (para a UI mostrar o resumo)
 */
async function finishSession({ windowMs, overlapMs } = {}) {
  if (!pendingStop) return;
  const { emgBuffer, imuBuffer, endTime, duration, alertCount } = pendingStop;
  pendingStop = null;

  // Envelope RMS calculado uma única vez, sobre o sinal EMG completo da sessão.
  const envResult = computeRmsEnvelope(emgBuffer, {
    mvc: mvcValue,
    fs:  fsValue,
    windowMs,
    overlapMs,
  });

  // Atualiza a sessão local com os dados finais — sempre grava, mesmo offline.
  // emgData e imuData gravam-se AMBOS em bruto (todas as amostras recolhidas,
  // sem downsample), para que o export CSV e a base de dados reflitam
  // exatamente o que foi recolhido. A redução de pontos é feita só no momento
  // de DESENHAR os gráficos (HistoryDetailPage / PDF), nunca ao guardar.
  if (sessionId) {
    await syncService.queueSessionEnd(sessionId, {
      endTime:    endTime.toISOString(),
      duration,
      mvc:        mvcValue,
      alertCount,
      emgData:    emgBuffer,
      imuData:    imuBuffer,
      envelope:   envResult.envelope,
      envelopeParams: {
        windowMs:      envResult.windowMs,
        overlapMs:     envResult.overlapMs,
        fs:            envResult.fs,
        windowSamples: envResult.windowSamples,
        hopSamples:    envResult.hopSamples,
      },
    });
    syncService.trySyncAll(tokenGetter());
  }

  sessionId = null;
  return envResult;
}

/**
 * Para a monitorização e guarda logo a sessão com a janela/overlap por
 * omissão — usado quando não há pop-up para o utilizador escolher (ex:
 * paragem automática ao perder a ligação ao módulo). Seguro chamar mesmo
 * sem monitorização ativa.
 */
async function stop() {
  if (!state.isMonitoring) return;
  stopCapture();
  return finishSession({});
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
  stopCapture,
  finishSession,
  subscribe,
  getState,
};