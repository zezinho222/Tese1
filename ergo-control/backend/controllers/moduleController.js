const Module = require('../models/Module');

// ─── GET /api/modules ─────────────────────────────────────────────────────
// Lista todos os módulos do utilizador autenticado
const getModules = async (req, res) => {
  try {
    const modules = await Module.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, modules });
  } catch (error) {
    console.error('Erro ao listar módulos:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── POST /api/modules ────────────────────────────────────────────────────
// Guarda um módulo recém-conectado na base de dados
const addModule = async (req, res) => {
  try {
    const { name, type, ip, port, battery } = req.body;

    if (!name || !type || !ip) {
      return res.status(400).json({
        success: false,
        message: 'Nome, tipo e IP são obrigatórios.',
      });
    }

    if (!['sEMG', 'IMU', 'EMS'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de módulo inválido. Use: sEMG, IMU ou EMS.',
      });
    }

    // Verificar se já existe um módulo com o mesmo IP para este utilizador
    const existing = await Module.findOne({ user: req.user._id, ip });
    if (existing) {
      // Atualiza os dados em vez de duplicar
      existing.name = name;
      existing.type = type;
      existing.port = port || 80;
      existing.battery = battery ?? null;
      existing.connected = true;
      existing.lastSeen = Date.now();
      await existing.save();
      return res.status(200).json({ success: true, module: existing });
    }

    const module = await Module.create({
      user: req.user._id,
      name,
      type,
      ip,
      port: port || 80,
      battery: battery ?? null,
      connected: true,
      lastSeen: Date.now(),
    });

    res.status(201).json({ success: true, module });
  } catch (error) {
    console.error('Erro ao adicionar módulo:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── DELETE /api/modules/:id ──────────────────────────────────────────────
// Remove um módulo (desligar)
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

// ─── GET /api/modules/scan?type=sEMG ─────────────────────────────────────
// Simula a descoberta de módulos na rede Wi-Fi local via HTTP polling
// Em produção, os módulos ESP32 respondem em http://<ip>/info
const scanModules = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type || !['sEMG', 'IMU', 'EMS'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "type" obrigatório: sEMG, IMU ou EMS.',
      });
    }

    // Busca os IPs já guardados para este utilizador (para marcar como "já ligado")
    const existingModules = await Module.find({ user: req.user._id });
    const existingIPs = existingModules.map((m) => m.ip);

    // ── Dispositivos simulados por tipo ──────────────────────────────────
    // Em produção, aqui farias broadcast UDP ou varredura da subnet para
    // encontrar ESPs que respondem em /info. Como ainda é desenvolvimento,
    // devolvemos dispositivos mock realistas.
    const mockDevices = {
      sEMG: [
        { name: 'sEMG-Module-01', ip: '192.168.1.101', port: 80, battery: 85, type: 'sEMG' },
        { name: 'sEMG-Module-02', ip: '192.168.1.102', port: 80, battery: 62, type: 'sEMG' },
      ],
      IMU: [
        { name: 'IMU-Module-01', ip: '192.168.1.111', port: 80, battery: 91, type: 'IMU' },
      ],
      EMS: [
        { name: 'EMS-Module-01', ip: '192.168.1.121', port: 80, battery: 45, type: 'EMS' },
        { name: 'EMS-Module-02', ip: '192.168.1.122', port: 80, battery: 78, type: 'EMS' },
      ],
    };

    const found = (mockDevices[type] || []).map((device) => ({
      ...device,
      alreadyConnected: existingIPs.includes(device.ip),
    }));

    res.status(200).json({ success: true, devices: found });
  } catch (error) {
    console.error('Erro ao procurar módulos:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

module.exports = { getModules, addModule, removeModule, scanModules };