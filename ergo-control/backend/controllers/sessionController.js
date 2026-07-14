const Session = require('../models/Session');

// ─── GET /api/sessions ────────────────────────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id })
      .sort({ startTime: -1 })
      .limit(100);
    res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── GET /api/sessions/:id ────────────────────────────────────────────────────
const getSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('Erro ao obter sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── POST /api/sessions ───────────────────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const { sensorType, startTime, endTime, duration, mvc, alertCount, notes } = req.body;

    if (!sensorType || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'sensorType e startTime são obrigatórios.',
      });
    }

    if (!['EMG', 'IMU', 'DUAL'].includes(sensorType)) {
      return res.status(400).json({
        success: false,
        message: 'sensorType inválido. Use: EMG, IMU ou DUAL.',
      });
    }

    const session = await Session.create({
      user:       req.user._id,
      sensorType,
      startTime:  new Date(startTime),
      endTime:    endTime ? new Date(endTime) : null,
      duration:   duration || 0,
      mvc:        mvc || null,
      alertCount: alertCount || 0,
      notes:      notes || '',
    });

    res.status(201).json({ success: true, session });
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── PATCH /api/sessions/:id/end ─────────────────────────────────────────────
const endSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }

    const { endTime, duration, mvc, alertCount, emgData, imuData } = req.body;

    session.endTime    = endTime    ? new Date(endTime) : new Date();
    session.duration   = duration   ?? session.duration;
    session.mvc        = mvc        ?? session.mvc;
    session.alertCount = alertCount ?? session.alertCount;
    if (Array.isArray(emgData)) session.emgData = emgData;
    if (Array.isArray(imuData)) session.imuData = imuData;

    await session.save();
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('Erro ao terminar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── DELETE /api/sessions/:id ─────────────────────────────────────────────────
const deleteSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }
    await session.deleteOne();
    res.status(200).json({ success: true, message: 'Sessão eliminada.' });
  } catch (error) {
    console.error('Erro ao eliminar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

module.exports = { getSessions, getSession, createSession, endSession, deleteSession };