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