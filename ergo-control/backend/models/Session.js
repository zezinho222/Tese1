const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      default: null,
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
    // Nome do módulo guardado diretamente na sessão (além da referência
    // acima) — para aparecer já pronto ao consultar a base de dados
    // diretamente, sem precisar de fazer populate ao Module.
    moduleName: {
      type: String,
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
    // Amostras EMG em bruto, tal como recolhidas (freq × duração amostras) —
    // usadas no export CSV; o gráfico no histórico reduz (downsample) no
    // cliente só para desenhar a linha.
    emgData: {
      type: [Number],
      default: [],
    },
    imuData: {
      // cada elemento é [pitch, roll]
      type: [[Number]],
      default: [],
    },
    // Envelope RMS calculado no fim da monitorização, já normalizado pelo MVC
    // (1.0 = 100% MVC). A janela e o overlap são escolhidos pelo utilizador
    // no momento em que para a sessão.
    envelope: {
      type: [Number],
      default: [],
    },
    envelopeParams: {
      windowMs:      { type: Number, default: null }, // largura da janela (ms)
      overlapMs:     { type: Number, default: null }, // overlap (ms)
      fs:            { type: Number, default: null }, // frequência de amostragem (Hz)
      windowSamples: { type: Number, default: null }, // = windowMs/1000 * fs
      hopSamples:    { type: Number, default: null }, // = (windowMs-overlapMs)/1000 * fs
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);