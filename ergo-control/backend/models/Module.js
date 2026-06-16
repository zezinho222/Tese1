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
    type: {
      type: String,
      enum: ['sEMG', 'IMU', 'EMS'],
      required: [true, 'O tipo do módulo é obrigatório'],
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