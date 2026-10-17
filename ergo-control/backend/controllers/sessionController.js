const Session = require('../models/Session');
const SessionChunk = require('../models/SessionChunk');
const Module = require('../models/Module');

const LIST_FIELDS =
  '_id user userName module moduleName sensorType startTime endTime duration mvc alertCount synced createdAt updatedAt';

// Limites de cada bloco de sinal. Mesmo no pior caso (tudo cheio) um bloco fica
// bem abaixo dos 16 MiB que o MongoDB permite por documento:
// 200 000 amostras EMG ≈ 3,2 MB, 50 000 pares IMU ≈ 1,8 MB, 20 000 do envelope ≈ 0,3 MB.
const MAX_EMG_PER_CHUNK = 200000;
const MAX_IMU_PER_CHUNK = 50000;
const MAX_ENV_PER_CHUNK = 20000;
const MAX_CHUNKS        = 10000; // proteção contra índices absurdos

// Junta o mesmo campo de todos os blocos (já ordenados por index)
const joinChunks = (chunks, field) => [].concat(...chunks.map((c) => c[field] || []));

// Valida os arrays de um bloco. Devolve uma mensagem de erro ou null se estiver tudo bem.
const validateChunkBody = ({ emgData, imuData, envelope }) => {
  if (!Array.isArray(emgData) || !Array.isArray(imuData) || !Array.isArray(envelope)) {
    return 'emgData, imuData e envelope têm de ser arrays.';
  }
  if (emgData.length > MAX_EMG_PER_CHUNK || imuData.length > MAX_IMU_PER_CHUNK || envelope.length > MAX_ENV_PER_CHUNK) {
    return 'Bloco demasiado grande. Divide o sinal em blocos mais pequenos.';
  }
  if (!emgData.every(Number.isFinite) || !envelope.every(Number.isFinite)) {
    return 'emgData e envelope só podem ter números.';
  }
  if (!imuData.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    return 'imuData tem de ser uma lista de pares [pitch, roll].';
  }
  return null;
};

// GET /api/sessions
// Listar todas as sessões do utilizador autenticado
const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id })
      .select(LIST_FIELDS)
      .sort({ startTime: -1 })
      .limit(200)
      .lean();
    res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// GET /api/sessions/:id
// Obter detalhes de uma sessão específica (inclui os sinais em bruto)
const getSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }

    // Sessões novas: o sinal está nos blocos (SessionChunk), reconstrói-se aqui para
    // a app receber o mesmo formato de sempre (emgData, imuData e envelope completos).
    // Sessões antigas (chunkCount 0) já trazem o sinal no próprio documento.
    if (session.chunkCount > 0) {
      const chunks = await SessionChunk.find({
        session: session._id,
        index: { $lt: session.chunkCount },
      })
        .sort({ index: 1 })
        .select('emgData imuData envelope')
        .lean();
      session.emgData  = joinChunks(chunks, 'emgData');
      session.imuData  = joinChunks(chunks, 'imuData');
      session.envelope = joinChunks(chunks, 'envelope');
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

// PUT /api/sessions/:id/chunks/:index
// Guarda um bloco do sinal da sessão. É idempotente: reenviar o mesmo índice
// substitui o bloco, por isso a app pode repetir o envio se a rede falhar a meio.
const putChunk = async (req, res) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) {
      return res.status(400).json({ success: false, message: 'Índice do bloco inválido.' });
    }

    const session = await Session.findOne({ _id: req.params.id, user: req.user._id }).select('_id');
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }

    const { emgData = [], imuData = [], envelope = [] } = req.body;
    const problem = validateChunkBody({ emgData, imuData, envelope });
    if (problem) {
      return res.status(400).json({ success: false, message: problem });
    }

    await SessionChunk.findOneAndUpdate(
      { session: session._id, index },
      { $set: { user: req.user._id, emgData, imuData, envelope } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true, index });
  } catch (error) {
    console.error('Erro ao guardar bloco da sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// Terminar uma sessão existente
const endSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }

    const {
      endTime, duration, mvc, alertCount, emgData, imuData, envelope, envelopeParams, packetStats, chunkCount,
    } = req.body;

    // Com chunkCount, o sinal já foi enviado em blocos (PUT /:id/chunks/:index).
    // Confirma-se que estão todos antes de dar a sessão por fechada.
    let n = null;
    if (chunkCount !== undefined && chunkCount !== null) {
      n = Number(chunkCount);
      if (!Number.isInteger(n) || n < 0 || n > MAX_CHUNKS) {
        return res.status(400).json({ success: false, message: 'chunkCount inválido.' });
      }
      const found = n > 0
        ? await SessionChunk.countDocuments({ session: session._id, index: { $lt: n } })
        : 0;
      if (found !== n) {
        return res.status(409).json({
          success: false,
          message: `Faltam blocos de sinal (${found} de ${n}).`,
        });
      }
      // Remove blocos a mais de um envio anterior que tivesse mais blocos
      await SessionChunk.deleteMany({ session: session._id, index: { $gte: n } });
    }

    session.endTime    = endTime    ? new Date(endTime) : new Date();
    session.duration   = duration   ?? session.duration;
    session.mvc        = mvc        ?? session.mvc;
    session.alertCount = alertCount ?? session.alertCount;
    if (envelopeParams) session.envelopeParams = envelopeParams;

    if (n !== null) {
      session.chunkCount = n;
      if (n > 0) {
        // o sinal vive nos blocos; limpa o que possa ter ficado no documento
        session.emgData  = [];
        session.imuData  = [];
        session.envelope = [];
      }
    } else {
      // Compatibilidade com versões antigas da app: sinal todo no mesmo pedido
      if (Array.isArray(emgData)) session.emgData = emgData;
      if (Array.isArray(envelope)) session.envelope = envelope;
      if (Array.isArray(imuData)) session.imuData = imuData;
    }

    if (packetStats) {
      session.packetStats = packetStats;
      session.markModified('packetStats');
    }

    await session.save();

    // Devolve só metadados, não faz sentido reenviar à app os megabytes de
    // sinal que ela acabou de mandar
    res.status(200).json({
      success: true,
      session: {
        _id:        session._id,
        sensorType: session.sensorType,
        startTime:  session.startTime,
        endTime:    session.endTime,
        duration:   session.duration,
        mvc:        session.mvc,
        alertCount: session.alertCount,
      },
    });
  } catch (error) {
    console.error('Erro ao terminar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// DELETE /api/sessions/:id
// Eliminar uma sessão existente
const deleteSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id }).select('_id');
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
    }
    await SessionChunk.deleteMany({ session: session._id });
    await session.deleteOne();
    res.status(200).json({ success: true, message: 'Sessão eliminada.' });
  } catch (error) {
    console.error('Erro ao eliminar sessão:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

module.exports = { getSessions, getSession, createSession, putChunk, endSession, deleteSession };