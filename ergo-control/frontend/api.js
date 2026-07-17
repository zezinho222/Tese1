const API_URL = 'https://tese1.onrender.com';

// Chamado sempre que o backend rejeita o token (expirado/inválido), para a
// app poder fazer logout e pedir novo login em vez de falhar em silêncio
// para sempre. Registado pelo AuthContext.
let onUnauthorized = null;
const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

// Helper para pedidos autenticados
const authFetch = async (path, token, options = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) onUnauthorized?.();
  return res.json();
};

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────
  register: async ({ name, email, phone, password }) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone: phone || null, password }),
    });
    return res.json();
  },

  login: async ({ email, password }) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  forgotPassword: async ({ email }) => {
    const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  // ── User Profile ──────────────────────────────────────────────────────
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

  // ── Modules ──────────────────────────────────────────────────────────
  getModules: async (token) =>
    authFetch('/api/modules', token),

  scanModules: async (token) =>
    authFetch('/api/modules/scan', token),

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

  // ── Sessions ─────────────────────────────────────────────────────────
  getSessions: async (token) =>
    authFetch('/api/sessions', token),

  getSession: async (token, sessionId) =>
    authFetch(`/api/sessions/${sessionId}`, token),

  createSession: async (token, { sensorType, startTime, endTime, duration, mvc, alertCount }) =>
    authFetch('/api/sessions', token, {
      method: 'POST',
      body: JSON.stringify({ sensorType, startTime, endTime, duration, mvc, alertCount }),
    }),

  endSession: async (token, sessionId, { endTime, duration, mvc, alertCount, emgData, imuData }) =>
    authFetch(`/api/sessions/${sessionId}/end`, token, {
      method: 'PATCH',
      body: JSON.stringify({ endTime, duration, mvc, alertCount, emgData, imuData }),
    }),

  deleteSession: async (token, sessionId) =>
    authFetch(`/api/sessions/${sessionId}`, token, {
      method: 'DELETE',
    }),

  setOnUnauthorized,
};