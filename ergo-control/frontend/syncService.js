/**
 * syncService.js
 * Gere a fila de sincronização offline-first entre o AsyncStorage local
 * e o backend (Render.com + MongoDB).
 *
 * Filosofia:
 *  - O AsyncStorage é sempre a fonte de verdade imediata: todas as escritas
 *    (sessões, módulo conectado) são gravadas localmente primeiro,
 *    independentemente de haver internet.
 *  - Quando há internet REAL disponível (detetado via NetInfo — o Wi-Fi do
 *    módulo, sem internet, não conta), tenta sincronizar tudo o que ainda
 *    não foi enviado ao backend.
 *  - As páginas (Histórico, Módulos) devem ler sempre a partir daqui,
 *    nunca só do api.js diretamente, para funcionarem também sem internet.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';

const SESSIONS_KEY = '@ergocontrol/sessions';
const MODULE_KEY   = '@ergocontrol/connected_module';

let syncing = false;              // evita sincronizações concorrentes
let netUnsubscribe = null;
let tokenGetter = () => null;     // função que devolve o token atual (evita closures presos a um valor antigo)

// ─── Helpers ──────────────────────────────────────────────────────────────
function generateLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readSessions() {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeSessions(sessions) {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

async function readModule() {
  try {
    const raw = await AsyncStorage.getItem(MODULE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeModule(moduleData) {
  await AsyncStorage.setItem(MODULE_KEY, JSON.stringify(moduleData));
}

/** Verdadeiro só se houver mesmo acesso à internet (não conta o Wi-Fi do módulo, sem internet). */
async function hasInternet() {
  try {
    const state = await NetInfo.fetch();
    return !!state.isInternetReachable;
  } catch {
    return false;
  }
}

// ─── Sessões ──────────────────────────────────────────────────────────────

/**
 * Regista o início de uma sessão localmente e devolve o localId a usar
 * como referência (em vez do _id do backend, que pode não existir ainda
 * se estiveres sem internet).
 */
async function queueNewSession({ sensorType, startTime, mvc }) {
  const sessions = await readSessions();
  const localId = generateLocalId();
  const entry = {
    localId,
    backendId: null,
    synced: false,
    sensorType,
    startTime,
    endTime: null,
    duration: null,
    mvc: mvc ?? null,
    alertCount: 0,
  };
  sessions.unshift(entry);
  await writeSessions(sessions);
  return localId;
}

/** Atualiza uma sessão local com os dados de fim (chamado ao parar a monitorização). */
async function queueSessionEnd(localId, { endTime, duration, mvc, alertCount }) {
  const sessions = await readSessions();
  const idx = sessions.findIndex((s) => s.localId === localId);
  if (idx === -1) return;
  sessions[idx] = {
    ...sessions[idx],
    endTime,
    duration,
    mvc: mvc ?? sessions[idx].mvc,
    alertCount,
    synced: false, // força reenvio do estado final ao backend
  };
  await writeSessions(sessions);
}

/**
 * Devolve as sessões para mostrar no Histórico: sempre a partir do local
 * (fonte de verdade), fazendo primeiro um merge com o backend se houver
 * internet disponível — assim funciona tanto online como offline.
 */
async function getMergedSessions(token) {
  if (token && (await hasInternet())) {
    await pullRemoteSessions(token);
  }
  const sessions = await readSessions();
  return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

/** Traz sessões do backend que ainda não existem localmente (ex: reinstalação da app). */
async function pullRemoteSessions(token) {
  try {
    const res = await api.getSessions(token);
    if (!res?.success || !Array.isArray(res.sessions)) return;

    const local = await readSessions();
    const knownBackendIds = new Set(local.filter((s) => s.backendId).map((s) => s.backendId));

    const newOnes = res.sessions
      .filter((remote) => !knownBackendIds.has(remote._id))
      .map((remote) => ({
        localId: generateLocalId(),
        backendId: remote._id,
        synced: true,
        sensorType: remote.sensorType,
        startTime: remote.startTime,
        endTime: remote.endTime ?? null,
        duration: remote.duration ?? null,
        mvc: remote.mvc ?? null,
        alertCount: remote.alertCount ?? 0,
      }));

    if (newOnes.length > 0) {
      await writeSessions([...newOnes, ...local]);
    }
  } catch {
    // sem internet real ou backend em baixo — ignora, mantém o que já está local
  }
}

/** Tenta enviar ao backend todas as sessões locais ainda não sincronizadas. */
async function syncSessions(token) {
  if (!token) return;
  const sessions = await readSessions();
  let changed = false;

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s.synced) continue;

    try {
      if (!s.backendId) {
        const res = await api.createSession(token, {
          sensorType: s.sensorType,
          startTime: s.startTime,
          mvc: s.mvc,
        });
        if (res?.success && res?.session?._id) {
          s.backendId = res.session._id;
          changed = true;
        } else {
          continue; // falhou — tenta na próxima sincronização
        }
      }

      if (s.endTime) {
        const res2 = await api.endSession(token, s.backendId, {
          endTime: s.endTime,
          duration: s.duration,
          mvc: s.mvc,
          alertCount: s.alertCount,
        });
        if (res2?.success) {
          s.synced = true;
          changed = true;
        }
      }
      // se ainda não tem endTime, a sessão está ativa — fica por sincronizar o fim
    } catch {
      // ainda sem internet real — tenta na próxima chamada
    }
  }

  if (changed) await writeSessions(sessions);
}

// ─── Módulo ───────────────────────────────────────────────────────────────

/** Grava o módulo localmente (sempre) e marca por sincronizar. */
async function queueModuleSave(moduleData) {
  const toSave = { ...moduleData, synced: false, backendId: moduleData.backendId ?? null };
  await writeModule(toSave);
  return toSave;
}

async function getLocalModule() {
  return readModule();
}

/** Tenta criar o módulo no backend se ainda não tiver backendId. */
async function syncModule(token) {
  if (!token) return;
  const mod = await readModule();
  if (!mod || mod.synced || mod.backendId) return;

  try {
    const res = await api.addModule(token, {
      name: mod.name,
      ip: mod.ip,
      port: mod.port,
      battery: mod.battery,
      sensorSelection: mod.sensorSelection,
      offsetValue: mod.offsetValue,
      offsetLabel: mod.offsetLabel,
      freqHz: mod.freqHz,
      freqValue: mod.freqValue,
    });
    if (res?.success && res?.module?._id) {
      await writeModule({ ...mod, backendId: res.module._id, synced: true });
    }
  } catch {
    // sem internet real — tenta mais tarde
  }
}

// ─── Sincronização geral ───────────────────────────────────────────────────

/** Corre a sincronização de tudo (módulo + sessões). Ignora chamadas concorrentes ou sem internet. */
async function trySyncAll(token) {
  if (syncing) return;
  if (!token) return;
  if (!(await hasInternet())) return;

  syncing = true;
  try {
    await syncModule(token);
    await syncSessions(token);
  } finally {
    syncing = false;
  }
}

/**
 * Regista um listener de conectividade que dispara a sincronização
 * automaticamente sempre que a internet REAL fica disponível.
 * Chamar uma única vez, em App.js.
 * @param {() => string|null} getToken - função que devolve o token atual
 */
function initNetworkListener(getToken) {
  tokenGetter = getToken;
  if (netUnsubscribe) return; // já registado, só atualiza o tokenGetter acima

  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isInternetReachable) {
      trySyncAll(tokenGetter());
    }
  });
}

function stopNetworkListener() {
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
}

export const syncService = {
  queueNewSession,
  queueSessionEnd,
  getMergedSessions,
  queueModuleSave,
  getLocalModule,
  trySyncAll,
  initNetworkListener,
  stopNetworkListener,
  hasInternet,
};

export default syncService;