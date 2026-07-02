const Module = require('../models/Module');

const MODULE_IP   = '192.168.4.2';
const MODULE_PORT = 80;
const SCAN_TIMEOUT = 5000; // ms

// ─── GET /api/modules ─────────────────────────────────────────────────────────
const getModules = async (req, res) => {
  try {
    const modules = await Module.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, modules });
  } catch (error) {
    console.error('Erro ao listar módulos:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── POST /api/modules ────────────────────────────────────────────────────────
const addModule = async (req, res) => {
  try {
    const {
      name,
      ip,
      port,
      battery,
      sensorSelection,
      offsetValue,
      offsetLabel,
      freqHz,
      freqValue,
    } = req.body;

    if (!name || !ip) {
      return res.status(400).json({ success: false, message: 'Nome e IP são obrigatórios.' });
    }

    if (sensorSelection && !['EMG', 'IMU', 'DUAL'].includes(sensorSelection)) {
      return res.status(400).json({
        success: false,
        message: 'sensorSelection inválido. Use: EMG, IMU ou DUAL.',
      });
    }

    // Verificar se já existe módulo com este IP para o utilizador
    const existing = await Module.findOne({ user: req.user._id, ip });

    if (existing) {
      // Atualiza em vez de duplicar
      existing.name            = name;
      existing.port            = port || MODULE_PORT;
      existing.battery         = battery ?? null;
      existing.sensorSelection = sensorSelection || existing.sensorSelection;
      existing.offsetValue     = offsetValue     ?? existing.offsetValue;
      existing.offsetLabel     = offsetLabel     || existing.offsetLabel;
      existing.freqHz          = freqHz          ?? existing.freqHz;
      existing.freqValue       = freqValue       ?? existing.freqValue;
      existing.connected       = true;
      existing.lastSeen        = Date.now();
      await existing.save();
      return res.status(200).json({ success: true, module: existing });
    }

    const module = await Module.create({
      user:            req.user._id,
      name,
      ip,
      port:            port || MODULE_PORT,
      battery:         battery ?? null,
      sensorSelection: sensorSelection || null,
      offsetValue:     offsetValue     ?? null,
      offsetLabel:     offsetLabel     || null,
      freqHz:          freqHz          ?? null,
      freqValue:       freqValue       ?? null,
      connected:       true,
      lastSeen:        Date.now(),
    });

    res.status(201).json({ success: true, module });
  } catch (error) {
    console.error('Erro ao adicionar módulo:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── DELETE /api/modules/:id ──────────────────────────────────────────────────
const removeModule = async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, user: req.user._id });
    if (!module) {
      return res.status(404).json({ success: false, message: 'Módulo não encontrado.' });
    }
    await module.deleteOne();
    res.status(200).json({ success: true, message: 'Módulo removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover módulo:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── GET /api/modules/scan ────────────────────────────────────────────────────
// O scan real é feito diretamente pelo telemóvel (moduleService.isModuleReachable).
// Este endpoint devolve o IP fixo do módulo para o backend ter registo.
const scanModules = async (req, res) => {
  try {
    const existingModules = await Module.find({ user: req.user._id });
    const existingIPs     = existingModules.map((m) => m.ip);

    const device = {
      name:             'ErgoControl',
      ip:               MODULE_IP,
      port:             MODULE_PORT,
      battery:          null,
      alreadyConnected: existingIPs.includes(MODULE_IP),
    };

    res.status(200).json({ success: true, devices: [device] });
  } catch (error) {
    console.error('Erro ao procurar módulos:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── PATCH /api/modules/:id/calibration ──────────────────────────────────────
const updateCalibration = async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, user: req.user._id });
    if (!module) {
      return res.status(404).json({ success: false, message: 'Módulo não encontrado.' });
    }

    const { sensor, mvc } = req.body; // sensor: 'sEMG' | 'IMU'

    if (sensor === 'sEMG') {
      module.calibrated.sEMG = true;
      if (mvc != null) module.mvc = mvc;
    } else if (sensor === 'IMU') {
      module.calibrated.IMU = true;
    }

    await module.save();
    res.status(200).json({ success: true, module });
  } catch (error) {
    console.error('Erro ao guardar calibração:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

module.exports = { getModules, addModule, removeModule, scanModules, updateCalibration };