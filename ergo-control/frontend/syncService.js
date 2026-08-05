import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';
import moduleService from './moduleService';

// Gere a fila de sincronização offline-first entre o AsyncStorage locale o backend
// As páginas Histórico e Módulos lem sempre a partir daqui nunca só do api.js diretamente, para funcionarem também sem internet

const SESSIONS_KEY = '@ergocontrol/sessions';
const MODULE_KEY   = '@ergocontrol/connected_module';
const PENDING_DELETES_KEY = '@ergocontrol/pending_session_deletes';
const MAX_CHART_POINTS = 200; // limite de pontos guardados nos graficos por sessão 

let syncPromise = null;        
let netUnsubscribe = null;
let tokenGetter = () => null;
let lastSyncError = null;      

// Gera um ID único local (prefixo "local_") para identificar sessões criadas offline, antes de terem um ID atribuído pelo backend
function generateLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Usado nos graficos do Histórico e no PDF exportado, para não sobrecarregar a app nem o backend com milhares de pontos por sessão
// A redução é feita só no momento de desenhar os gráficos, nunca ao guardar os dados brutos.
function downsampleArray(arr, maxPoints = MAX_CHART_POINTS) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

// Le do AsyncStorage a lista de sessões guardadas localmente
// Devolve [] se não existir ou der erro
async function readSessions() {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Substitui no AsyncStorage a lista completa de sessões locais
async function writeSessions(sessions) {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// Le do AsyncStorage os dados do módulo atualmente ligado
// Devolve null se não existir ou der erro
async function readModule() {
  try {
    const raw = await AsyncStorage.getItem(MODULE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Substitui no AsyncStorage os dados do módulo atualmente ligado
async function writeModule(moduleData) {
  await AsyncStorage.setItem(MODULE_KEY, JSON.stringify(moduleData));
}

// IDs (backendId) de sessões apagadas localmente sem internet real, que ainda faltam apagar no backend
async function readPendingDeletes() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DELETES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Substitui no AsyncStorage a lista de IDs de sessões cuja eliminação ainda está pendente de sincronizar com o backend
async function writePendingDeletes(ids) {
  await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids));
}

// Verdadeiro só se houver mesmo acesso à internet (não conta o Wi-Fi do módulo, sem internet)
async function hasInternet() {
  try {
    const state = await NetInfo.fetch();
    return !!state.isInternetReachable;
  } catch {
    return false;
  }
}

// Sessões
// Cria e guarda localmente uma sessão nova (ainda sem backendId)
async function queueNewSession({ sensorType, startTime, mvc }) {
  const localId = generateLocalId();
  try {
    const sessions = await readSessions();
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
      emgData: [],
      imuData: [],
      envelope: [],
      envelopeParams: null,
    };
    sessions.unshift(entry);
    await writeSessions(sessions);
  } catch (e) {
    console.warn('[syncService] Falha ao gravar sessão localmente:', e);
  }
  return localId;
}

// Preenche a sessão local com os dados finais
async function queueSessionEnd(localId, { endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams }) {
  const sessions = await readSessions();
  const idx = sessions.findIndex((s) => s.localId === localId);
  if (idx === -1) return;
  sessions[idx] = {
    ...sessions[idx],
    endTime,
    duration,
    mvc: mvc ?? sessions[idx].mvc,
    alertCount,
    emgData: emgData ?? sessions[idx].emgData ?? [],
    imuData: imuData ?? sessions[idx].imuData ?? [],
    envelope: envelope ?? sessions[idx].envelope ?? [],
    envelopeParams: envelopeParams ?? sessions[idx].envelopeParams ?? null,
    synced: false, // força reenvio do estado final ao backend
  };
  await writeSessions(sessions);
}

// Sincroniza (se houver token) e devolve as sessões locais ordenadas da mais recente para a mais antiga.
async function getMergedSessions(token) {
  if (token) await trySyncAll(token);
  const sessions = await readSessions();
  return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

// Puxa sessões do backend: adiciona localmente as novas e remove as que já foram sincronizadas
async function pullRemoteSessions(token) {
  try {
    const res = await api.getSessions(token);
    if (!res?.success || !Array.isArray(res.sessions)) return;

    const pendingDeletes = new Set(await readPendingDeletes());
    const remoteSessions = res.sessions.filter((remote) => !pendingDeletes.has(remote._id));

    const local = await readSessions();
    const knownBackendIds = new Set(local.filter((s) => s.backendId).map((s) => s.backendId));
    const remoteIds = new Set(remoteSessions.map((remote) => remote._id));

    const newOnes = remoteSessions
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
        emgData: remote.emgData ?? [],
        envelope: remote.envelope ?? [],
        envelopeParams: remote.envelopeParams ?? null,
        imuData: remote.imuData ?? [],
      }));

    // Sessões já sincronizadas (com backendId) que deixaram de existir no backend são removidas localmente 
    const stillValid = local.filter((s) => !s.backendId || remoteIds.has(s.backendId));

    if (newOnes.length > 0 || stillValid.length !== local.length) {
      await writeSessions([...newOnes, ...stillValid]);
    }
  } catch {
  }
}

// Apaga a sessão localmente e, se já existia no backend, tenta apagá-la lá também
// Se falhar, fica na fila de eliminações pendentes
async function deleteSession(token, localId) {
  const sessions = await readSessions();
  const target = sessions.find((s) => s.localId === localId);
  await writeSessions(sessions.filter((s) => s.localId !== localId));

  if (!target?.backendId) return;

  if (token) {
    try {
      const res = await api.deleteSession(token, target.backendId);
      if (res?.success) return;
    } catch {
    }
  }

  const pending = await readPendingDeletes();
  if (!pending.includes(target.backendId)) {
    await writePendingDeletes([...pending, target.backendId]);
  }
}

// Tenta apagar no backend todas as sessões da fila de eliminações pendentes
async function syncPendingDeletes(token) {
  if (!token) return;
  const pending = await readPendingDeletes();
  if (pending.length === 0) return;

  const stillPending = [];
  for (const backendId of pending) {
    try {
      const res = await api.deleteSession(token, backendId);
      if (!res?.success) stillPending.push(backendId);
    } catch {
      stillPending.push(backendId); // ainda sem internet real — tenta na próxima
    }
  }
  await writePendingDeletes(stillPending);
}
// Envia ao backend as sessões locais por sincronizar: cria as que faltam criar e fecha as que já têm endTime.
async function syncSessions(token) {
  if (!token) return;
  const sessions = await readSessions();
  let changed = false;

  const mod = await readModule();

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s.synced) continue;

    try {
      if (!s.backendId) {
        const res = await api.createSession(token, {
          sensorType: s.sensorType,
          startTime: s.startTime,
          mvc: s.mvc,
          module: mod?.backendId ?? null,
        });
        if (res?.success && res?.session?._id) {
          s.backendId = res.session._id;
          changed = true;
        } else {
          continue; 
        }
      }

      if (s.endTime) {
        const res2 = await api.endSession(token, s.backendId, {
          endTime: s.endTime,
          duration: s.duration,
          mvc: s.mvc,
          alertCount: s.alertCount,
          emgData: s.emgData || [],
          envelope: s.envelope || [],
          envelopeParams: s.envelopeParams || null,
          imuData: s.imuData || [],
        });
        if (res2?.success) {
          s.synced = true;
          changed = true;
        }
      }
    } catch {
    }
  }

  if (changed) await writeSessions(sessions);
}

// Módulo 
// Guarda localmente um módulo novo (ainda por sincronizar com o backend)
async function queueModuleSave(moduleData) {
  const toSave = { ...moduleData, synced: false, backendId: moduleData.backendId ?? null };
  await writeModule(toSave);
  return toSave;
}

// Aplica alterações parciais ao módulo local guardado e marca-o como por sincronizar
async function queueModuleUpdate(patch) {
  const mod = await readModule();
  if (!mod) return null;
  const updated = { ...mod, ...patch, synced: false };
  await writeModule(updated);
  return updated;
}

//Devolve o módulo guardado localmente
async function getLocalModule() {
  return readModule();
}

// Envia ao backend o estado de calibração do módulo
async function pushCalibration(token, mod) {
  if (!mod.backendId) return;
  if (mod.calibrated?.sEMG) {
    await api.updateCalibration(token, mod.backendId, { sensor: 'sEMG', mvc: mod.mvc });
  }
  if (mod.calibrated?.IMU) {
    await api.updateCalibration(token, mod.backendId, { sensor: 'IMU' });
  }
}

// Sincroniza o módulo local com o backend
async function syncModule(token) {
  if (!token) return;
  const mod = await readModule();
  if (!mod || mod.synced) return;

  try {
    if (!mod.backendId) {
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
      if (!res?.success || !res?.module?._id) {
        lastSyncError = res?.message || 'Backend recusou o pedido ao guardar o módulo.';
        console.warn('[syncService] Falha ao sincronizar módulo (resposta):', res);
        return;
      }
      const withId = { ...mod, backendId: res.module._id };
      await pushCalibration(token, withId);
      await writeModule({ ...withId, synced: true });
    } else {
      await pushCalibration(token, mod);
      await writeModule({ ...mod, synced: true });
    }
    lastSyncError = null;
  } catch (e) {
    lastSyncError = e?.message || String(e);
    console.warn('[syncService] Falha ao sincronizar módulo:', e);
  }
}

// Sincronização geral 

//Corre toda a sincronização por ordem garantindo que nunca há duas sincronizações em paralelo
async function trySyncAll(token) {
  if (syncPromise) return syncPromise;
  if (!token) return;

  syncPromise = (async () => {
    try {
      if (!(await hasInternet())) return;
      if (!moduleService.isMonitoring()) {
        await moduleService.disconnect();
      }
      await syncModule(token);
      await syncSessions(token);
      await syncPendingDeletes(token);
      await pullRemoteSessions(token);
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

// Regista o listener de rede que dispara a sincronização sempre que a internet fica acessível
function initNetworkListener(getToken) {
  tokenGetter = getToken;
  if (netUnsubscribe) return; // já registado, só atualiza o tokenGetter acima

  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isInternetReachable) {
      trySyncAll(tokenGetter());
    }
  });
}

// Remove o listener de rede registado
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
  deleteSession,
  queueModuleSave,
  queueModuleUpdate,
  getLocalModule,
  trySyncAll,
  initNetworkListener,
  stopNetworkListener,
  hasInternet,
  downsampleArray,
  getLastSyncError: () => lastSyncError,
};

export default syncService;