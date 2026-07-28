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
import moduleService from './moduleService';

const SESSIONS_KEY = '@ergocontrol/sessions';
const MODULE_KEY   = '@ergocontrol/connected_module';
const PENDING_DELETES_KEY = '@ergocontrol/pending_session_deletes';
const MAX_CHART_POINTS = 200; // limite de pontos guardados por sessão, para gráficos

let syncPromise = null;           // promise da sincronização em curso — evita duas em paralelo
let netUnsubscribe = null;
let tokenGetter = () => null;     // função que devolve o token atual (evita closures presos a um valor antigo)
let lastSyncError = null;         // última falha de sync (módulo ou sessões), para mostrar na UI

// ─── Helpers ──────────────────────────────────────────────────────────────
function generateLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Reduz um array para no máximo maxPoints, escolhendo índices espaçados
 * uniformemente — usado para não guardar/sincronizar sessões inteiras
 * (podem ter milhares de amostras por segundo).
 */
function downsampleArray(arr, maxPoints = MAX_CHART_POINTS) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
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

/** IDs (backendId) de sessões apagadas localmente sem internet real, que ainda faltam apagar no backend. */
async function readPendingDeletes() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_DELETES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writePendingDeletes(ids) {
  await AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids));
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
    };
    sessions.unshift(entry);
    await writeSessions(sessions);
  } catch (e) {
    // Não deixa uma falha a gravar localmente impedir o arranque da
    // monitorização em si — sem isto, um erro aqui abortava
    // handleStartMonitoring ANTES de moduleService.startMonitoring() ser
    // chamado, e os gráficos ficavam "Sem dados" sem nenhum erro visível.
    console.warn('[syncService] Falha ao gravar sessão localmente:', e);
  }
  return localId;
}

/**
 * Atualiza uma sessão local com os dados de fim (chamado ao parar a
 * monitorização) — incluindo os dados dos gráficos (já reduzidos com
 * downsampleArray antes de chegarem aqui).
 */
async function queueSessionEnd(localId, { endTime, duration, mvc, alertCount, emgData, imuData }) {
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
    synced: false, // força reenvio do estado final ao backend
  };
  await writeSessions(sessions);
}

/**
 * Devolve as sessões para mostrar no Histórico: sempre a partir do local
 * (fonte de verdade), fazendo primeiro um trySyncAll (envia + recebe) se
 * houver internet disponível — assim funciona tanto online como offline.
 * Não faz a receção (pull) sozinha: isso corre sempre dentro de
 * trySyncAll, serializado com o envio, para nunca duplicar sessões.
 */
async function getMergedSessions(token) {
  if (token) await trySyncAll(token);
  const sessions = await readSessions();
  return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

/** Traz sessões do backend que ainda não existem localmente (ex: reinstalação da app). */
async function pullRemoteSessions(token) {
  try {
    const res = await api.getSessions(token);
    if (!res?.success || !Array.isArray(res.sessions)) return;

    // Sessões ainda por apagar no backend (apagadas localmente sem internet
    // real) não podem ser tratadas como "novas" só porque ainda existem lá —
    // sem isto, ao apagar offline, a próxima sincronização voltava a puxar a
    // mesma sessão do backend como se nunca tivesse sido apagada.
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
        imuData: remote.imuData ?? [],
      }));

    // Sessões já sincronizadas (com backendId) que deixaram de existir no
    // backend (ex: apagadas noutro dispositivo) são removidas localmente —
    // sem isto, o Histórico e o Perfil continuavam a contar sessões já
    // eliminadas da base de dados. Sessões ainda por sincronizar (sem
    // backendId) não são tocadas.
    const stillValid = local.filter((s) => !s.backendId || remoteIds.has(s.backendId));

    if (newOnes.length > 0 || stillValid.length !== local.length) {
      await writeSessions([...newOnes, ...stillValid]);
    }
  } catch {
    // sem internet real ou backend em baixo — ignora, mantém o que já está local
  }
}

/**
 * Apaga uma sessão: remove sempre localmente (fonte de verdade imediata) e
 * tenta já apagá-la também no backend. Se não houver internet real (ex:
 * offline, ou ligado apenas à Wi-Fi do módulo), o backendId fica guardado
 * numa fila de "por apagar" — syncPendingDeletes (chamado dentro de
 * trySyncAll) tenta de novo assim que houver internet, para o Histórico e o
 * Perfil ficarem sempre em conformidade com a base de dados, mais cedo ou
 * mais tarde.
 */
async function deleteSession(token, localId) {
  const sessions = await readSessions();
  const target = sessions.find((s) => s.localId === localId);
  await writeSessions(sessions.filter((s) => s.localId !== localId));

  // Nunca chegou a existir no backend (sessão só local, ainda por
  // sincronizar) — não há nada para apagar lá.
  if (!target?.backendId) return;

  if (token) {
    try {
      const res = await api.deleteSession(token, target.backendId);
      if (res?.success) return; // já apagada no backend — não fica pendente
    } catch {
      // sem internet real — cai para a fila de pendentes abaixo
    }
  }

  const pending = await readPendingDeletes();
  if (!pending.includes(target.backendId)) {
    await writePendingDeletes([...pending, target.backendId]);
  }
}

/** Tenta apagar no backend todas as sessões marcadas como "por apagar" (ver deleteSession). */
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

/** Tenta enviar ao backend todas as sessões locais ainda não sincronizadas. */
async function syncSessions(token) {
  if (!token) return;
  const sessions = await readSessions();
  let changed = false;

  // Módulo local atual — lido uma única vez aqui (não guardado na própria
  // sessão) para associar sempre o módulo mais recentemente sincronizado.
  // syncModule() já correu antes disto dentro de trySyncAll, por isso, se o
  // módulo já tiver backendId, é o valor mais fresco possível — mesmo que a
  // sessão tenha sido criada localmente antes de o módulo estar sincronizado
  // com o backend (ex: os dois a começar offline, ligados só à Wi-Fi do
  // módulo, e a internet só chegar depois).
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
          continue; // falhou — tenta na próxima sincronização
        }
      }

      if (s.endTime) {
        const res2 = await api.endSession(token, s.backendId, {
          endTime: s.endTime,
          duration: s.duration,
          mvc: s.mvc,
          alertCount: s.alertCount,
          emgData: s.emgData || [],
          imuData: s.imuData || [],
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

/**
 * Aplica alterações ao módulo local (ex: calibração, MVC) e marca por
 * sincronizar — mantém o backendId existente, ao contrário de
 * queueModuleSave (que é só para a criação inicial). Usado sempre que algo
 * muda depois de o módulo já estar guardado (normalmente ainda offline,
 * ligado à Wi-Fi do módulo), para não se perder quando a internet voltar.
 */
async function queueModuleUpdate(patch) {
  const mod = await readModule();
  if (!mod) return null;
  const updated = { ...mod, ...patch, synced: false };
  await writeModule(updated);
  return updated;
}

async function getLocalModule() {
  return readModule();
}

/** Envia ao backend a calibração/MVC guardados localmente (idempotente). */
async function pushCalibration(token, mod) {
  if (!mod.backendId) return;
  if (mod.calibrated?.sEMG) {
    await api.updateCalibration(token, mod.backendId, { sensor: 'sEMG', mvc: mod.mvc });
  }
  if (mod.calibrated?.IMU) {
    await api.updateCalibration(token, mod.backendId, { sensor: 'IMU' });
  }
}

/**
 * Sincroniza o módulo com o backend: cria-o se ainda não existir lá, ou,
 * se já existir, reenvia as alterações locais por sincronizar (calibração,
 * MVC) — sem isto, calibrar offline (ligado à Wi-Fi do módulo) nunca
 * chegava à base de dados mesmo depois de haver internet.
 */
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

// ─── Sincronização geral ───────────────────────────────────────────────────

/**
 * Corre a sincronização de tudo (módulo + sessões, envio E receção).
 * Chamadas concorrentes devolvem a MESMA promise em vez de fazerem cada uma
 * a sua leitura/escrita do array de sessões ao mesmo tempo — era isso que
 * duplicava sessões: uma chamada lia o array antes de a outra escrever o
 * backendId novo, e a escrita mais tardia acabava por apagar essa alteração
 * (ou por não reconhecer a sessão já criada e voltar a puxá-la do backend
 * como se fosse nova).
 */
async function trySyncAll(token) {
  // O cadeado (syncPromise) tem de ser reservado de forma SÍNCRONA, sem
  // nenhum await pelo meio — caso contrário, duas chamadas quase em
  // simultâneo (ex: o listener de rede em App.js + a página a carregar)
  // passavam as duas a verificação "if (syncPromise)" enquanto ainda
  // estava livre, e só reservavam o cadeado cada uma depois do seu próprio
  // await, criando duas sincronizações em paralelo na mesma.
  if (syncPromise) return syncPromise;
  if (!token) return;

  syncPromise = (async () => {
    try {
      if (!(await hasInternet())) return;

      // Se há internet real, já não podemos estar na Wi-Fi do módulo (sem
      // internet) — mas o forceWifiUsage(true) do Android pode ter ficado
      // "preso" à rede antiga do hotspot (ex: utilizador trocou de rede nas
      // definições sem passar pelo botão "voltar" do ecrã de configuração).
      // Isso força TODOS os pedidos HTTP da app pela rede sem internet,
      // fazendo a sincronização falhar silenciosamente para sempre. Larga
      // esse "force" aqui, exceto durante uma monitorização ativa (aí o
      // socket ao módulo ainda é necessário).
      if (!moduleService.isMonitoring()) {
        await moduleService.disconnect();
      }
      await syncModule(token);
      await syncSessions(token);
      // Tenta apagar no backend qualquer sessão apagada localmente enquanto
      // offline, ANTES de puxar sessões remotas — para essa sessão não ser
      // trazida de volta na mesma sincronização em que finalmente é apagada.
      await syncPendingDeletes(token);
      // Puxa sessões do backend que ainda não existam localmente DEPOIS de
      // enviar as locais — na mesma operação serializada, para nunca correr
      // ao mesmo tempo que o envio (ver comentário acima).
      await pullRemoteSessions(token);
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
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