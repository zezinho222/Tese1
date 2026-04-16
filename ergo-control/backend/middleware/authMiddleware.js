const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    // Verificar se o token existe no header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acesso negado. Token não fornecido.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verificar e descodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Buscar o utilizador na base de dados
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não encontrado ou inativo.',
      });
    }

    // Guardar o utilizador no request para uso posterior
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado.',
    });
  }
};

module.exports = { protect };