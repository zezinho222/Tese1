const API_URL = 'https://tese1.onrender.com';

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
};