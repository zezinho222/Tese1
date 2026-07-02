const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'O nome do módulo é obrigatório'],
      trim: true,
    },
    // Tipo base do módulo (hardware)
    type: {
      type: String,
      enum: ['sEMG', 'IMU', 'EMS', 'DUAL'],
      default: 'DUAL',
    },
    ip: {
      type: String,
      required: [true, 'O endereço IP é obrigatório'],
      trim: true,
    },
    port: {
      type: Number,
      default: 80,
    },
    battery: {
      type: Number,
      default: null,
    },
    // Sensores selecionados pelo utilizador: 'EMG' | 'IMU' | 'DUAL'
    sensorSelection: {
      type: String,
      enum: ['EMG', 'IMU', 'DUAL'],
      default: null,
    },
    // Valor enviado ao módulo para o offset (0, 2500 ou 3605)
    offsetValue: {
      type: Number,
      default: null,
    },
    // Label do offset escolhido ('0.9V', '1.9V', '2.6V')
    offsetLabel: {
      type: String,
      default: null,
    },
    // Frequência em Hz escolhida pelo utilizador (1000-4000)
    freqHz: {
      type: Number,
      default: null,
    },
    // Valor calculado pela fórmula e enviado ao módulo
    freqValue: {
      type: Number,
      default: null,
    },
    // Estado de calibração por sensor
    calibrated: {
      sEMG: { type: Boolean, default: false },
      IMU:  { type: Boolean, default: false },
    },
    // Valor MVC calculado na calibração sEMG
    mvc: {
      type: Number,
      default: null,
    },
    connected: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Module', moduleSchema);