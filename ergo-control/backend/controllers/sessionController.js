const Session = require('../models/Session');
const Module = require('../models/Module');

// GET /api/sessions
// Listar todas as sessões do utilizador autenticado
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

// GET /api/sessions/:id
// Obter detalhes de uma sessão específica
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

// POST /api/sessions
// Criar uma nova sessão
const createSession = async (req, res) => {
  try {
    const { sensorType, startTime, endTime, duration, mvc, alertCount, module } = req.body;

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

    let moduleId = null;
    let moduleName = null;
    if (module) {
      const mod = await Module.findOne({ _id: module, user: req.user._id }).select('_id name');
      if (mod) {
        moduleId = mod._id;
        moduleName = mod.name;
      }
    }

    const session = await Session.create({
      user:       req.user._id,
      userName:   req.user.name,
      module:     moduleId,
      moduleName,
      sensorType,
      startTime:  new Date(startTime),
      endTime:    endTime ? new Date(endTime) : null,
      duration:   duration || 0,
      mvc:        mvc || null,
      alertCount: alertCount || 0,
    });

    res.status(201).json({ success: true, session });
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// PATCH /api/sessions/:id/end 
// Terminar uma sessão existente
const endSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }

    const { endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams, packetStats } = req.body;

    session.endTime    = endTime    ? new Date(endTime) : new Date();
    session.duration   = duration   ?? session.duration;
    session.mvc        = mvc        ?? session.mvc;
    session.alertCount = alertCount ?? session.alertCount;
    if (Array.isArray(emgData)) session.emgData = emgData;
    if (Array.isArray(envelope)) session.envelope = envelope;
    if (envelopeParams) session.envelopeParams = envelopeParams;
    if (Array.isArray(imuData)) session.imuData = imuData;
    if (packetStats) session.packetStats = packetStats;

    await session.save();
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('Erro ao terminar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// DELETE /api/sessions/:id
// Eliminar uma sessão existente
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