import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';
import moduleService from './moduleService';

const SESSIONS_KEY        = '@ergocontrol/sessions';
const SESSION_DATA_PREFIX = '@ergocontrol/session_data/';
const MODULE_KEY          = '@ergocontrol/connected_module';
const PENDING_DELETES_KEY = '@ergocontrol/pending_session_deletes';
const MAX_CHART_POINTS    = 200; // limite de pontos desenhados nos gráficos por sessão

let syncPromise    = null;
let netUnsubscribe = null;
let tokenGetter    = () => null;
let lastSyncError  = null;
let syncAdiada     = false;
let ultimaTentativa = 0;
const NET_DEBOUNCE_MS = 5000;

// Campos pesados que NUNCA podem ficar no índice
const HEAVY_FIELDS = ['emgData', 'imuData', 'envelope', 'envelopeParams', 'packetStats'];

// Gera um ID único local (prefixo "local_") para identificar sessões criadas offline,
// antes de terem um ID atribuído pelo backend
function generateLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Usado nos gráficos do Histórico e no PDF exportado, para não sobrecarregar a app.
// A redução é feita só no momento de desenhar, nunca ao guardar os dados brutos.
function downsampleArray(arr, maxPoints = MAX_CHART_POINTS) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

// Separa um objeto de sessão em { light, data }
function splitSession(session) {
  const light = { ...session };
  const data = {};
  for (const f of HEAVY_FIELDS) {
    if (f in light) {
      data[f] = light[f];
      delete light[f];
    }
  }
  light.hasLocalData = true;
  return { light, data };
}

// Índice de sessões (leve)
async function readIndex() {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn('[syncService] Falha ao ler o índice de sessões:', e?.message || e);
    return [];
  }
}

async function writeIndex(sessions) {
  // rede de segurança: garante que nada pesado entra no índice
  const light = sessions.map((s) => {
    const copy = { ...s };
    for (const f of HEAVY_FIELDS) delete copy[f];
    return copy;
  });
  try {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(light));
  } catch (e) {
    console.warn('[syncService] Falha ao gravar o índice de sessões:', e?.message || e);
  }
}

// Dados pesados de uma sessão
async function readSessionData(localId) {
  try {
    const raw = await AsyncStorage.getItem(SESSION_DATA_PREFIX + localId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[syncService] Falha ao ler os dados da sessão', localId, e?.message || e);
    return null;
  }
}

async function writeSessionData(localId, data) {
  try {
    await AsyncStorage.setItem(SESSION_DATA_PREFIX + localId, JSON.stringify(data || {}));
    return true;
  } catch (e) {
    console.warn('[syncService] Falha ao gravar os dados da sessão', localId, e?.message || e);
    return false;
  }
}

async function removeSessionData(localId) {
  try {
    await AsyncStorage.removeItem(SESSION_DATA_PREFIX + localId);
  } catch {}
}

let migrated = false;
async function migrateLegacyStorage() {
  if (migrated) return;
  migrated = true;
  const index = await readIndex();
  if (index.length === 0) return;
  const needsMigration = index.some((s) => HEAVY_FIELDS.some((f) => f in s));
  if (!needsMigration) return;

  console.log('[syncService] A migrar o histórico local para o novo formato…');
  for (const s of index) {
    if (!HEAVY_FIELDS.some((f) => f in s)) continue;
    const { data } = splitSession(s);
    await writeSessionData(s.localId, data);
  }
  await writeIndex(index.map((s) => ({ ...s, hasLocalData: true })));
}

// Módulo
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

// IDs (backendId) de sessões apagadas localmente sem internet real
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
  let state = null;
  try {
    state = await NetInfo.fetch();
  } catch {
    return false;
  }
  if (state?.isInternetReachable === true) return true;
  if (state?.isConnected === false) return false;
  return api.ping();
}

// Sessões
// Cria e guarda localmente uma sessão nova (ainda sem backendId)
async function queueNewSession({ sensorType, startTime, mvc }) {
  await migrateLegacyStorage();
  const localId = generateLocalId();
  try {
    const sessions = await readIndex();
    sessions.unshift({
      localId,
      backendId: null,
      synced: false,
      hasLocalData: false,
      sensorType,
      startTime,
      endTime: null,
      duration: null,
      mvc: mvc ?? null,
      alertCount: 0,
    });
    await writeIndex(sessions);
  } catch (e) {
    console.warn('[syncService] Falha ao gravar sessão localmente:', e);
  }
  return localId;
}

// Preenche a sessão local com os dados finais
async function queueSessionEnd(localId, {
  endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams, packetStats,
}) {
  await migrateLegacyStorage();
  const sessions = await readIndex();
  const idx = sessions.findIndex((s) => s.localId === localId);
  if (idx === -1) return;

  const prev = (await readSessionData(localId)) || {};
  const data = {
    emgData:        emgData        ?? prev.emgData        ?? [],
    imuData:        imuData        ?? prev.imuData        ?? [],
    envelope:       envelope       ?? prev.envelope       ?? [],
    envelopeParams: envelopeParams ?? prev.envelopeParams ?? null,
    packetStats:    packetStats    ?? prev.packetStats    ?? null,
  };
  const stored = await writeSessionData(localId, data);

  sessions[idx] = {
    ...sessions[idx],
    endTime,
    duration,
    mvc: mvc ?? sessions[idx].mvc,
    alertCount,
    hasLocalData: stored,
    detailLoaded: stored,
    synced: false, // força reenvio do estado final ao backend
  };
  await writeIndex(sessions);
}

// Sincroniza (se houver token) e devolve as sessões locais,
// ordenadas da mais recente para a mais antiga.
async function getMergedSessions(token) {
  await migrateLegacyStorage();
  if (token) await trySyncAll(token);
  const sessions = await readIndex();
  return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

// Devolve uma sessão completa
async function getSessionDetail(token, localId) {
  await migrateLegacyStorage();
  const sessions = await readIndex();
  const entry = sessions.find((s) => s.localId === localId);
  if (!entry) return null;

  let data = await readSessionData(localId);
  const isEmpty = !data || (
    (!data.emgData || data.emgData.length === 0) &&
    (!data.imuData || data.imuData.length === 0) &&
    (!data.envelope || data.envelope.length === 0)
  );

  if (isEmpty && entry.backendId && token && (await hasInternet())) {
    try {
      const res = await api.getSession(token, entry.backendId);
      if (res?.success && res?.session) {
        const r = res.session;
        data = {
          emgData:        Array.isArray(r.emgData) ? r.emgData : [],
          imuData:        Array.isArray(r.imuData) ? r.imuData : [],
          envelope:       Array.isArray(r.envelope) ? r.envelope : [],
          envelopeParams: r.envelopeParams ?? null,
          packetStats:    r.packetStats ?? null,
        };
        await writeSessionData(localId, data);
        const fresh = await readIndex();
        const i = fresh.findIndex((s) => s.localId === localId);
        if (i !== -1) {
          fresh[i] = { ...fresh[i], hasLocalData: true, detailLoaded: true };
          await writeIndex(fresh);
        }
      } else {
        console.warn('[syncService] getSession sem sucesso:', res?.message);
      }
    } catch (e) {
      console.warn('[syncService] Falha ao obter detalhe da sessão:', e?.message || e);
    }
  }

  return {
    ...entry,
    emgData:        data?.emgData ?? [],
    imuData:        data?.imuData ?? [],
    envelope:       data?.envelope ?? [],
    envelopeParams: data?.envelopeParams ?? null,
    packetStats:    data?.packetStats ?? null,
  };
}

// Puxa sessões do backend, adiciona localmente as novas e remove as que já
// tinham sido sincronizadas e deixaram de existir no servidor
async function pullRemoteSessions(token) {
  let res;
  try {
    res = await api.getSessions(token);
  } catch (e) {
    lastSyncError = `Falha ao obter sessões do servidor: ${e?.message || e}`;
    console.warn('[syncService]', lastSyncError);
    return;
  }

  if (!res?.success || !Array.isArray(res.sessions)) {
    lastSyncError = res?.message || 'Resposta inválida do servidor ao listar sessões.';
    console.warn('[syncService]', lastSyncError, res);
    return;
  }

  try {
    const pendingDeletes = new Set(await readPendingDeletes());
    const remoteSessions = res.sessions.filter((r) => !pendingDeletes.has(r._id));

    const local = await readIndex();
    const byBackendId = new Map(local.filter((s) => s.backendId).map((s) => [s.backendId, s]));
    const remoteIds = new Set(remoteSessions.map((r) => r._id));

    const newOnes = remoteSessions
      .filter((r) => !byBackendId.has(r._id))
      .map((r) => ({
        localId: generateLocalId(),
        backendId: r._id,
        synced: true,
        hasLocalData: false,
        detailLoaded: false,
        sensorType: r.sensorType,
        startTime: r.startTime,
        endTime: r.endTime ?? null,
        duration: r.duration ?? null,
        mvc: r.mvc ?? null,
        alertCount: r.alertCount ?? 0,
      }));

    // Sessões já sincronizadas que deixaram de existir no backend saem daqui
    const removed = local.filter((s) => s.backendId && !remoteIds.has(s.backendId));
    const stillValid = local.filter((s) => !s.backendId || remoteIds.has(s.backendId));
    for (const s of removed) await removeSessionData(s.localId);

    if (newOnes.length > 0 || stillValid.length !== local.length) {
      await writeIndex([...newOnes, ...stillValid]);
    }
    lastSyncError = null;
  } catch (e) {
    lastSyncError = e?.message || String(e);
    console.warn('[syncService] Falha ao juntar sessões remotas:', e);
  }
}

// Apaga a sessão localmente e, se já existia no backend, tenta apagá-la lá também
// Se falhar, fica na fila de eliminações pendentes
async function deleteSession(token, localId) {
  const sessions = await readIndex();
  const target = sessions.find((s) => s.localId === localId);
  await writeIndex(sessions.filter((s) => s.localId !== localId));
  await removeSessionData(localId);

  if (!target?.backendId) return;

  if (token) {
    try {
      const res = await api.deleteSession(token, target.backendId);
      if (res?.success) return;
    } catch {}
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
      stillPending.push(backendId);
    }
  }
  await writePendingDeletes(stillPending);
}

// Envia ao backend as sessões locais por sincronizar
async function syncSessions(token) {
  if (!token) return;
  const sessions = await readIndex();
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
          lastSyncError = res?.message || 'Backend recusou criar a sessão.';
          console.warn('[syncService]', lastSyncError);
          continue;
        }
      }

      if (s.endTime) {
        const data = (await readSessionData(s.localId)) || {};
        const res2 = await api.endSession(token, s.backendId, {
          endTime: s.endTime,
          duration: s.duration,
          mvc: s.mvc,
          alertCount: s.alertCount,
          emgData: data.emgData || [],
          envelope: data.envelope || [],
          envelopeParams: data.envelopeParams || null,
          imuData: data.imuData || [],
          packetStats: data.packetStats || null,
        });
        if (res2?.success) {
          s.synced = true;
          changed = true;
        } else {
          lastSyncError = res2?.message || 'Backend recusou fechar a sessão.';
          console.warn('[syncService]', lastSyncError);
        }
      }
    } catch (e) {
      lastSyncError = e?.message || String(e);
      console.warn('[syncService] Falha ao sincronizar sessão:', e);
    }
  }

  if (changed) await writeIndex(sessions);
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

// Corre toda a sincronização por ordem, garantindo que nunca há duas em paralelo.
async function trySyncAll(token) {
  if (syncPromise) return syncPromise;
  if (!token) return;

  syncPromise = (async () => {
    try {
      await migrateLegacyStorage();
      if (!(await hasInternet())) {
        if (!syncAdiada) console.log('[syncService] Sem internet real — sincronização adiada.');
        syncAdiada = true;
        return;
      }
      syncAdiada = false;

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

// Regista o listener de rede que dispara a sincronização quando a internet fica acessível
function initNetworkListener(getToken) {
  tokenGetter = getToken;
  if (netUnsubscribe) return;

  netUnsubscribe = NetInfo.addEventListener((state) => {
    if (!state.isInternetReachable) return;
    const agora = Date.now();
    if (agora - ultimaTentativa < NET_DEBOUNCE_MS) return;
    ultimaTentativa = agora;
    trySyncAll(tokenGetter());
  });

  // Assim que o módulo se desliga, o telemóvel volta à rede normal
  moduleService.addCloseListener('sync', () => {
    if (!syncAdiada) return;
    setTimeout(() => trySyncAll(tokenGetter()), 1500);
  });
}

// Remove o listener de rede registado
function stopNetworkListener() {
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
  moduleService.removeCloseListener('sync');
}

async function clearAllLocalData() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const nossas = keys.filter((k) => k.startsWith('@ergocontrol/'));
    if (nossas.length) await AsyncStorage.multiRemove(nossas);
  } catch (e) {
    console.warn('[sync] Falha ao limpar dados locais:', e?.message ?? e);
  }
}

export const syncService = {
  queueNewSession,
  queueSessionEnd,
  getMergedSessions,
  getSessionDetail,
  deleteSession,
  queueModuleSave,
  queueModuleUpdate,
  getLocalModule,
  trySyncAll,
  initNetworkListener,
  stopNetworkListener,
  hasInternet,
  downsampleArray,
  clearAllLocalData,
  getLastSyncError: () => lastSyncError,
};

export default syncService;