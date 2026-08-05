const mongoose = require('mongoose');

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