const express = require('express');
const router  = express.Router();
const {getSessions, getSession, createSession, putChunk, endSession, deleteSession} = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getSessions);
router.get('/:id', protect, getSession);
router.post('/', protect, createSession);
router.put('/:id/chunks/:index', protect, putChunk);
router.patch('/:id/end', protect, endSession);
router.delete('/:id', protect, deleteSession);

module.exports = router;