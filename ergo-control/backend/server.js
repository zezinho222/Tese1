const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

dotenv.config();

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

// Servir assets do frontend
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

// ─── Página de redefinição de password (forgot password) ──────────────────
app.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  res.send(buildHtmlPage({
    title: '🔒 Redefinir Password',
    subtitle: 'Introduza a sua nova password abaixo.<br>Deve ter pelo menos 8 caracteres.',
    field1: { id: 'password', label: 'Nova password', placeholder: 'Nova password' },
    field2: { id: 'confirm', label: 'Confirmar password', placeholder: 'Confirmar password' },
    btnText: 'Redefinir Password',
    script: `
      async function submitForm() {
        const passwordEl = document.getElementById('password');
        const confirmEl  = document.getElementById('confirm');
        const password   = passwordEl.value;
        const confirm    = confirmEl.value;
        const msg        = document.getElementById('msg');
        const btn        = document.getElementById('btn');

        msg.className = 'msg';
        msg.textContent = '';
        passwordEl.classList.remove('error');
        confirmEl.classList.remove('error');

        if (!password || !confirm) {
          showError('Preenche ambos os campos.');
          if (!password) passwordEl.classList.add('error');
          if (!confirm)  confirmEl.classList.add('error');
          return;
        }
        if (password !== confirm) {
          showError('As passwords não coincidem.');
          passwordEl.classList.add('error');
          confirmEl.classList.add('error');
          return;
        }
        if (password.length < 8) {
          showError('A password deve ter pelo menos 8 caracteres.');
          passwordEl.classList.add('error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'A processar...';

        try {
          const res = await fetch('/api/auth/reset-password/${token}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const data = await res.json();

          if (res.ok) {
            showSuccess('✅ Password redefinida com sucesso! Podes fechar esta página e fazer login na app.');
            btn.style.display = 'none';
          } else {
            showError(data.message || 'Erro ao redefinir. O link pode ter expirado.');
            btn.disabled = false;
            btn.textContent = 'Redefinir Password';
          }
        } catch (e) {
          showError('Erro de ligação. Tenta novamente.');
          btn.disabled = false;
          btn.textContent = 'Redefinir Password';
        }
      }
    `,
  }));
});

// ─── Página de verificação de alteração de email ──────────────────────────
app.get('/verify-email-change/:token', (req, res) => {
  const { token } = req.params;
  res.send(`
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmar Email - ErgoControl</title>
      ${getBaseStyles()}
    </head>
    <body>
      <div class="card" id="card">
        <div class="logo-row">
          <img src="/assets/ErgoControl.png" alt="ErgoControl" />
          <span class="logo-label">ErgoControl</span>
        </div>
        <div id="loading" style="text-align:center;padding:24px 0;">
          <p style="color:var(--text-secondary);font-size:15px;">A confirmar alteração de email...</p>
        </div>
        <div class="msg" id="msg"></div>
      </div>
      <script>
        (async () => {
          try {
            const res = await fetch('/api/user/verify-email-change/${token}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            document.getElementById('loading').style.display = 'none';
            const msg = document.getElementById('msg');
            if (res.ok) {
              msg.className = 'msg success';
              msg.textContent = '✅ ' + (data.message || 'Email alterado com sucesso!');
            } else {
              msg.className = 'msg error';
              msg.textContent = data.message || 'Token inválido ou expirado.';
            }
          } catch(e) {
            document.getElementById('loading').style.display = 'none';
            const msg = document.getElementById('msg');
            msg.className = 'msg error';
            msg.textContent = 'Erro de ligação. Tenta novamente mais tarde.';
          }
        })();
      </script>
    </body>
    </html>
  `);
});

// ─── Página de verificação de alteração de password ───────────────────────
app.get('/verify-password-change/:token', (req, res) => {
  const { token } = req.params;
  res.send(buildHtmlPage({
    title: '🔑 Alterar Password',
    subtitle: 'Introduza a sua nova password abaixo.<br>Deve ter pelo menos 8 caracteres.',
    field1: { id: 'password', label: 'Nova password', placeholder: 'Nova password' },
    field2: { id: 'confirm', label: 'Confirmar password', placeholder: 'Confirmar password' },
    btnText: 'Guardar Nova Password',
    script: `
      async function submitForm() {
        const passwordEl = document.getElementById('password');
        const confirmEl  = document.getElementById('confirm');
        const password   = passwordEl.value;
        const confirm    = confirmEl.value;
        const btn        = document.getElementById('btn');

        passwordEl.classList.remove('error');
        confirmEl.classList.remove('error');

        if (!password || !confirm) {
          showError('Preenche ambos os campos.');
          if (!password) passwordEl.classList.add('error');
          if (!confirm)  confirmEl.classList.add('error');
          return;
        }
        if (password !== confirm) {
          showError('As passwords não coincidem.');
          passwordEl.classList.add('error');
          confirmEl.classList.add('error');
          return;
        }
        if (password.length < 8) {
          showError('A password deve ter pelo menos 8 caracteres.');
          passwordEl.classList.add('error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'A processar...';

        try {
          const res = await fetch('/api/user/verify-password-change/${token}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const data = await res.json();

          if (res.ok) {
            showSuccess('✅ Password alterada com sucesso! Podes fechar esta página e fazer login na app.');
            btn.style.display = 'none';
          } else {
            showError(data.message || 'Erro ao alterar. O link pode ter expirado.');
            btn.disabled = false;
            btn.textContent = 'Guardar Nova Password';
          }
        } catch (e) {
          showError('Erro de ligação. Tenta novamente.');
          btn.disabled = false;
          btn.textContent = 'Guardar Nova Password';
        }
      }
    `,
  }));
});

// ─── Rotas ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'ErgoControl API a funcionar!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

// ─── Helpers HTML ─────────────────────────────────────────────────────────
function getBaseStyles() {
  return `
    <style>
      :root {
        --primary: #3B82F6;
        --primary-hover: #2563eb;
        --primary-shadow: rgba(59,130,246,0.30);
        --background: #F5F7FA;
        --card-bg: #F9FAFB;
        --border: #E5E7EB;
        --text-primary: #1F2937;
        --text-secondary: #6B7280;
        --text-red: #ef4444;
        --red-bg: #fee2e2;
        --success-bg: #d1fae5;
        --success-text: #065f46;
        --disabled: #D1D5DB;
        --white: #FFFFFF;
        --radius-md: 12px;
        --radius-lg: 16px;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--background);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 16px;
      }
      .card {
        background: var(--white);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 2px 8px rgba(229,231,235,0.6), 0 4px 20px rgba(0,0,0,0.06);
        width: 100%;
        max-width: 400px;
        padding: 28px 24px 32px;
      }
      .logo-row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin-bottom: 24px;
      }
      .logo-row img { height: 64px; width: auto; }
      .logo-label { font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: 1px; }
      h1 { font-size: 22px; font-weight: 800; color: var(--text-primary); text-align: center; margin-bottom: 6px; }
      .subtitle { font-size: 14px; color: var(--text-secondary); text-align: center; line-height: 20px; margin-bottom: 24px; }
      label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
      input[type="password"] {
        width: 100%;
        background: var(--card-bg);
        border: 2px solid var(--border);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        font-size: 16px;
        color: var(--text-primary);
        font-weight: 500;
        outline: none;
        transition: border-color 0.2s, background 0.2s;
        margin-bottom: 16px;
        font-family: inherit;
      }
      input[type="password"]:focus { border-color: var(--primary); background: var(--white); }
      input[type="password"].error { border-color: var(--text-red); background: var(--red-bg); }
      button#btn {
        width: 100%;
        background: var(--primary);
        color: var(--background);
        border: none;
        border-radius: var(--radius-md);
        padding: 15px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
        box-shadow: 0 4px 8px var(--primary-shadow);
        transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
        font-family: inherit;
      }
      button#btn:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
      button#btn:disabled { background: var(--disabled); cursor: not-allowed; box-shadow: none; transform: none; }
      .msg {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: var(--radius-md);
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        display: none;
        line-height: 20px;
      }
      .msg.success { background: var(--success-bg); color: var(--success-text); display: block; }
      .msg.error { background: var(--red-bg); color: var(--text-red); display: block; }
    </style>
  `;
}

function buildHtmlPage({ title, subtitle, field1, field2, btnText, script }) {
  return `
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title.replace(/[^\w\s-]/g, '')} - ErgoControl</title>
      ${getBaseStyles()}
    </head>
    <body>
      <div class="card">
        <div class="logo-row">
          <img src="/assets/ErgoControl.png" alt="ErgoControl" />
          <span class="logo-label">ErgoControl</span>
        </div>
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
        <label for="${field1.id}">${field1.label}</label>
        <input type="password" id="${field1.id}" placeholder="${field1.placeholder}" />
        <label for="${field2.id}">${field2.label}</label>
        <input type="password" id="${field2.id}" placeholder="${field2.placeholder}" />
        <button id="btn" onclick="submitForm()">${btnText}</button>
        <div class="msg" id="msg"></div>
      </div>
      <script>
        function showError(text) {
          const msg = document.getElementById('msg');
          msg.className = 'msg error';
          msg.textContent = text;
        }
        function showSuccess(text) {
          const msg = document.getElementById('msg');
          msg.className = 'msg success';
          msg.textContent = text;
        }
        ${script}
      </script>
    </body>
    </html>
  `;
}
