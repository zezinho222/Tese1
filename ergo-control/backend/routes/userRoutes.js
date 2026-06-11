const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordChange,
  verifyPasswordChange,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Todas as rotas requerem autenticação
router.get('/me', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/request-email-change', protect, requestEmailChange);
router.post('/request-password-change', protect, requestPasswordChange);

// Rotas de verificação (chamadas a partir da página web no email)
router.post('/verify-email-change/:token', verifyEmailChange);
router.post('/verify-password-change/:token', verifyPasswordChange);

module.exports = router;