const express = require('express');
const router = express.Router();
const { getModules, addModule, removeModule, scanModules, updateCalibration } = require('../controllers/moduleController');
const { protect } = require('../middleware/authMiddleware');

// Todas as rotas requerem autenticação JWT
router.get('/', protect, getModules);
router.post('/', protect, addModule);
router.delete('/:id', protect, removeModule);
router.get('/scan', protect, scanModules);
router.patch('/:id/calibration',  protect, updateCalibration);

module.exports = router;