const API_URL = 'https://tese1.onrender.com';

// Timeout dos pedidos normais
const REQUEST_TIMEOUT_MS = 60000;
// Timeout do teste de conectividade
const PING_TIMEOUT_MS = 8000;

// Chamado sempre que o backend rejeita o token (expirado/inválido), para a
// app poder fazer logout e pedir novo login em vez de falhar em silêncio
let onUnauthorized = null;
const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

// fetch com timeout, sem isto um pedido pode falhar para sempre
// e a página fica com o spinner infinito ou falha sem qualquer pista
const fetchWithTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Lê o corpo como JSON
const parseJson = async (res, path) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[api] Resposta não-JSON em ${path} (HTTP ${res.status}):`, text.slice(0, 200));
    return { success: false, message: `Resposta inválida do servidor (HTTP ${res.status}).` };
  }
};

// Faz um pedido autenticado à API e devolve o JSON.
// Se receber 401, chama o callback de logout.
const authFetch = async (path, token, options = {}) => {
  try {
    const res = await fetchWithTimeout(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) onUnauthorized?.();
    return await parseJson(res, path);
  } catch (e) {
    const message = e?.name === 'AbortError'
      ? 'O servidor demorou demasiado a responder.'
      : (e?.message || String(e));
    console.warn(`[api] Falha em ${path}:`, message);
    return { success: false, message };
  }
};

// API de backend
export const api = {
  // Teste de conectividade real (usado pelo syncService)
  ping: async () => {
    const targets = [`${API_URL}/`, 'https://www.gstatic.com/generate_204'];
    for (const url of targets) {
      try {
        const res = await fetchWithTimeout(url, { method: 'GET' }, PING_TIMEOUT_MS);
        if (res.ok || res.status === 204) return true;
      } catch {}
    }
    return false;
  },

  // Autenticação
  register: async ({ name, email, phone, password, acceptedTerms, policyVersion }) => {
    const res = await fetchWithTimeout(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        phone: phone || null,
        password,
        acceptedTerms,
        policyVersion,
      }),
    });
    return parseJson(res, '/api/auth/register');
  },

  login: async ({ email, password }) => {
    const res = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return parseJson(res, '/api/auth/login');
  },

  forgotPassword: async ({ email }) => {
    const res = await fetchWithTimeout(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return parseJson(res, '/api/auth/forgot-password');
  },

  // Perfil utilizador
  getProfile: async (token) =>
    authFetch('/api/user/me', token),

  updateProfile: async (token, { name, phone }) =>
    authFetch('/api/user/profile', token, {
      method: 'PUT',
      body: JSON.stringify({ name, phone }),
    }),

  requestEmailChange: async (token, { newEmail }) =>
    authFetch('/api/user/request-email-change', token, {
      method: 'POST',
      body: JSON.stringify({ newEmail }),
    }),

  requestPasswordChange: async (token) =>
    authFetch('/api/user/request-password-change', token, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  deleteAccount: async (token, { password }) =>
    authFetch('/api/user/me', token, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  // Modulos
  getModules: async (token) =>
    authFetch('/api/modules', token),

  addModule: async (token, { name, ip, port, battery, sensorSelection, offsetValue, offsetLabel, freqHz, freqValue }) =>
    authFetch('/api/modules', token, {
      method: 'POST',
      body: JSON.stringify({ name, ip, port, battery, sensorSelection, offsetValue, offsetLabel, freqHz, freqValue }),
    }),

  removeModule: async (token, moduleId) =>
    authFetch(`/api/modules/${moduleId}`, token, {
      method: 'DELETE',
    }),

  updateCalibration: async (token, moduleId, { sensor, mvc }) =>
    authFetch(`/api/modules/${moduleId}/calibration`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sensor, mvc }),
    }),

  // Sessões
  // Lista leve: sem emgData/imuData/envelope
  getSessions: async (token) =>
    authFetch('/api/sessions', token),

  // Sessão completa, com os sinais, só usada ao abrir o detalhe de uma sessão
  getSession: async (token, sessionId) =>
    authFetch(`/api/sessions/${sessionId}`, token),

  createSession: async (token, { sensorType, startTime, endTime, duration, mvc, alertCount, module }) =>
    authFetch('/api/sessions', token, {
      method: 'POST',
      body: JSON.stringify({ sensorType, startTime, endTime, duration, mvc, alertCount, module }),
    }),

  endSession: async (token, sessionId, { endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams, packetStats }) =>
    authFetch(`/api/sessions/${sessionId}/end`, token, {
      method: 'PATCH',
      body: JSON.stringify({ endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams, packetStats }),
    }),

  deleteSession: async (token, sessionId) =>
    authFetch(`/api/sessions/${sessionId}`, token, {
      method: 'DELETE',
    }),

  setOnUnauthorized,
};