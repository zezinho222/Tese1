const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');

dotenv.config();

const app = express();

// Ligar à base de dados
connectDB();

// Middlewares globais
app.use(cors());
app.use(express.json());

// Página web de redefinição de password (link do email)
app.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  res.send(`
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Redefinir Password - ErgoControl</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', sans-serif;
          background: #f0f4f8;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .card {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 400px;
          margin: 1rem;
        }
        h1 { font-size: 1.4rem; margin-bottom: 0.4rem; color: #1a202c; }
        p { color: #718096; margin-bottom: 1.5rem; font-size: 0.9rem; }
        label { font-size: 0.85rem; color: #4a5568; font-weight: 600; display: block; margin-bottom: 0.3rem; }
        input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 1rem;
          margin-bottom: 1rem;
          outline: none;
          transition: border 0.2s;
        }
        input:focus { border-color: #3B82F6; }
        button {
          width: 100%;
          padding: 0.75rem;
          background: #3B82F6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.2s;
        }
        button:hover { background: #2563eb; }
        button:disabled { background: #93c5fd; cursor: not-allowed; }
        .msg { margin-top: 1rem; padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; text-align: center; display: none; }
        .msg.success { background: #d1fae5; color: #065f46; display: block; }
        .msg.error   { background: #fee2e2; color: #991b1b; display: block; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🔒 Redefinir Password</h1>
        <p>Introduz a tua nova password abaixo. Deve ter pelo menos 8 caracteres.</p>
        <label>Nova password</label>
        <input type="password" id="password" placeholder="Nova password" />
        <label>Confirmar password</label>
        <input type="password" id="confirm" placeholder="Confirmar password" />
        <button id="btn" onclick="submitReset()">Redefinir Password</button>
        <div class="msg" id="msg"></div>
      </div>
      <script>
        async function submitReset() {
          const password = document.getElementById('password').value;
          const confirm  = document.getElementById('confirm').value;
          const msg = document.getElementById('msg');
          const btn = document.getElementById('btn');

          msg.className = 'msg';
          msg.textContent = '';

          if (!password || !confirm) {
            msg.className = 'msg error';
            msg.textContent = 'Preenche ambos os campos.';
            return;
          }
          if (password !== confirm) {
            msg.className = 'msg error';
            msg.textContent = 'As passwords não coincidem.';
            return;
          }
          if (password.length < 8) {
            msg.className = 'msg error';
            msg.textContent = 'A password deve ter pelo menos 8 caracteres.';
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
              msg.className = 'msg success';
              msg.textContent = '✅ Password redefinida com sucesso! Podes fechar esta página e fazer login na app.';
              btn.style.display = 'none';
            } else {
              msg.className = 'msg error';
              msg.textContent = data.message || 'Erro ao redefinir. O link pode ter expirado.';
              btn.disabled = false;
              btn.textContent = 'Redefinir Password';
            }
          } catch (e) {
            msg.className = 'msg error';
            msg.textContent = 'Erro de ligação. Tenta novamente.';
            btn.disabled = false;
            btn.textContent = 'Redefinir Password';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Rotas
app.use('/api/auth', authRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'ErgoControl API a funcionar!' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});