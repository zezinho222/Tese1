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
  sensorType: null, // usado para decidir se faz sentido pedir o envelope RMS ao parar
  elapsedSec: 0,
  alertCount: 0,
  emgPoints: [],
  imuPoints: [],
};

let state = { ...IDLE_STATE };
let listeners = new Set();

let sessionId   = null;
let mvcValue    = null;
let fsValue     = null; 
let tokenGetter = () => null;

let elapsedInterval = null;  
let graphInterval   = null; 
let imuAlertTracker = null;

// A monitorização ja esta parada nesta altura, so falta calcular o envelope
let pendingStop = null;

// Notifica todos os listeners com o estado atual
function notify() {
  const snapshot = { ...state };
  listeners.forEach((cb) => cb(snapshot));
}

function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getState() {
  return { ...state };
}

// Inicia a monitorização
async function start({ sensorType, mvc, fs, token }) {
  if (state.isMonitoring) return;

  mvcValue    = mvc ?? null;
  fsValue     = fs ?? null;
  tokenGetter = () => token;

  state = { ...IDLE_STATE, isMonitoring: true, sensorType };
  imuAlertTracker = createAlertTracker(ALERT_DEBOUNCE_MS);

  // Regista a sessão sempre localmente primeiro, porque o modulo nao tem rede wi-fi
  const now = new Date();
  sessionId = await syncService.queueNewSession({
    sensorType,
    startTime: now.toISOString(),
    mvc: mvcValue,
  });

  // Inicia a monitorização no módulo (envia EMG / IMU / DUAL)
  moduleService.startMonitoring(sensorType);

  syncService.trySyncAll(token);

  // Atualiza o estado a cada segundo (duração da sessão)
  elapsedInterval = setInterval(() => {
    state.elapsedSec += 1;
    notify();
  }, 1000);

  // Atualiza o gráfico a cada REFRESH_MS (1s) com os últimos DISPLAY_POINTS
  graphInterval = setInterval(() => {
    const { emgBuffer, imuBuffer } = moduleService.getRecentBuffers(DISPLAY_POINTS);
    state.emgPoints = emgBuffer;
    state.imuPoints = imuBuffer;

    const nowMs = Date.now();

    // Deteção de má postura IMU
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

// Para a monitorização
function stopCapture() {
  if (!state.isMonitoring) return;

  clearInterval(elapsedInterval);
  clearInterval(graphInterval);

  const { emgBuffer, imuBuffer } = moduleService.stopMonitoring();

  pendingStop = {
    emgBuffer,
    imuBuffer,
    sensorType: state.sensorType,
    endTime:    new Date(),
    duration:   state.elapsedSec,
    alertCount: state.alertCount,
  };

  state = { ...IDLE_STATE };
  notify();
}

// Calcula o envelope RMS e grava a sessão
async function finishSession({ windowMs, overlapMs } = {}) {
  if (!pendingStop) return;
  const { emgBuffer, imuBuffer, sensorType, endTime, duration, alertCount } = pendingStop;
  pendingStop = null;

  // O envelope RMS é um conceito exclusivo do sEMG (é calculado a partir do
  // sinal em bruto normalizado pelo MVC) — em sessões só de IMU não há sinal
  // nenhum para isso, por isso nem se calcula.

  // So calcula o envelope RMS se for monitorização EMG ou DUAL
  // caso contrário, devolve null
  const hasEMG = sensorType === 'EMG' || sensorType === 'DUAL';

  // Envelope RMS calculado uma unica vez, sobre o sinal EMG completo da sessão
  const envResult = hasEMG
    ? computeRmsEnvelope(emgBuffer, { mvc: mvcValue, fs: fsValue, windowMs, overlapMs })
    : null;


  /* emgData e imuData gravam-se ambos em bruto (todas as amostras recolhidas,
   sem downsample), para que ao exportar para CSV e na base de dados reflitam
   exatamente o que foi recolhido. A redução de pontos é feita só no momento
   de desenhar os gráficos (HistoryDetailPage / PDF), nunca ao guardar.
   */
  if (sessionId) {
    // Grava a sessão no servidor (ou localmente se offline)
    await syncService.queueSessionEnd(sessionId, {
      endTime:    endTime.toISOString(),
      duration,
      mvc:        mvcValue,
      alertCount,
      emgData:    emgBuffer,
      imuData:    imuBuffer,
      envelope:   envResult ? envResult.envelope : [],
      envelopeParams: envResult ? {
        windowMs:      envResult.windowMs,
        overlapMs:     envResult.overlapMs,
        fs:            envResult.fs,
        windowSamples: envResult.windowSamples,
        hopSamples:    envResult.hopSamples,
      } : null,
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

// Para a monitorização atual: interrompe a captura de dados e finaliza a sessão
async function stop() {
  if (!state.isMonitoring) return;
  stopCapture();
  return finishSession({});
}

// Se o módulo se desligar, para a monitorização e grava a sessão
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