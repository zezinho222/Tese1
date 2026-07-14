const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
    sensorType: {
      type: String,
      enum: ['EMG', 'IMU', 'DUAL'],
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      default: null,
    },
    // Duração em segundos
    duration: {
      type: Number,
      default: 0,
    },
    // MVC usado nesta sessão (valor de referência da calibração)
    mvc: {
      type: Number,
      default: null,
    },
    // Número de alertas gerados (ex: ultrapassagem de limiar)
    alertCount: {
      type: Number,
      default: 0,
    },
    // Flag para saber se foi sincronizada desde o AsyncStorage
    synced: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: '',
    },
    // Dados do gráfico (amostra reduzida — máx. 200 pontos, para visualização no histórico)
    emgData: {
      type: [Number],
      default: [],
    },
    imuData: {
      // cada elemento é [pitch, roll]
      type: [[Number]],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);