const express = require('express');
const router = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Rotas públicas
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Rotas protegidas (precisam de token JWT)
router.get('/me', protect, getMe);

module.exports = router;