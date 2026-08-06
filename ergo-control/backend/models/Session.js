const mongoose = require('mongoose');

// Intervalo contíguo de IDs de pacotes em falta (ex.: do 4880 ao 4885)
const packetGapSchema = new mongoose.Schema(
  {
    from:  { type: Number, required: true }, // primeiro ID em falta
    to:    { type: Number, required: true }, // último ID em falta
    count: { type: Number, required: true }, // quantos IDs faltaram
  },
  { _id: false }
);

// Estatísticas de perda de pacotes de uma sessão
const packetStatsSchema = new mongoose.Schema(
  {
    firstSeq:        { type: Number,  default: null },  // primeiro ID recebido
    lastSeq:         { type: Number,  default: null },  // último ID recebido
    received:        { type: Number,  default: 0 },     // pacotes recebidos
    lost:            { type: Number,  default: 0 },     // pacotes perdidos
    expected:        { type: Number,  default: 0 },     // recebidos + perdidos
    lossPct:         { type: Number,  default: 0 },     // % de perda
    duplicates:      { type: Number,  default: 0 },     // IDs repetidos
    outOfOrder:      { type: Number,  default: 0 },     // IDs fora de ordem
    wraps:           { type: Number,  default: 0 },     // voltas ao contador uint16
    emgSamplesReceived: { type: Number,  default: 0 },  // amostras sEMG recebidas
    imuSamplesReceived: { type: Number,  default: 0 },  // amostras IMU recebidas
    emgSamplesLostEst:  { type: Number,  default: 0 },  // amostras sEMG perdidas 
    imuSamplesLostEst:  { type: Number,  default: 0 },  // amostras IMU perdidas
    hasEmg:          { type: Boolean, default: false }, // a sessão recolheu sEMG
    hasImu:          { type: Boolean, default: false }, // a sessão recolheu IMU
    gaps:            { type: [packetGapSchema], default: [] },
    gapsTruncated:   { type: Boolean, default: false }, // lista de falhas cortada
  },
  { _id: false }
);

// Esquema das sessões na base de dados
const sessionSchema = new mongoose.Schema(
  {
    // Utilizador
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Nome do utilizador
    userName: {
      type: String,
      default: null,
    },
    // Módulo usado
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
    // Nome do módulo 
    moduleName: {
      type: String,
      default: null,
    },
    // Tipo de sensor usado
    sensorType: {
      type: String,
      enum: ['EMG', 'IMU', 'DUAL'],
      required: true,
    },
    // Data e hora do início e fim da sessão
    startTime: {
      type: Date,
      required: true,
    },
    // Data e hora do fim da sessão
    endTime: {
      type: Date,
      default: null,
    },
    // Duração em segundos
    duration: {
      type: Number,
      default: 0,
    },
    // Valor do MVC
    mvc: {
      type: Number,
      default: null,
    },
    // Número de alertas
    alertCount: {
      type: Number,
      default: 0,
    },
    // Estado de sincronização da sessão com o servidor
    synced: {
      type: Boolean,
      default: true,
    },
    // Amostras EMG
    emgData: {
      type: [Number],
      default: [],
    },
    // Amostras IMU
    imuData: {
      // cada elemento é [pitch, roll]
      type: [[Number]],
      default: [],
    },
    // Envelope RMS calculado no fim da monitorização
    envelope: {
      type: [Number],
      default: [],
    },
    packetStats: {
      type: packetStatsSchema,
      default: null,
    },
    // Parâmetros do envelope RMS
    envelopeParams: {
      windowMs:      { type: Number, default: null }, // largura da janela (ms)
      overlapMs:     { type: Number, default: null }, // overlap (ms)
      fs:            { type: Number, default: null }, // frequência de amostragem (Hz)
      windowSamples: { type: Number, default: null }, // = windowMs/1000 * fs (divido por 100 para converter ms em s)
      hopSamples:    { type: Number, default: null }, // = (windowMs-overlapMs)/1000 * fs (divido por 1000 para converter ms em s)
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);