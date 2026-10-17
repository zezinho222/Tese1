const mongoose = require('mongoose');

// Bloco de sinal de uma sessão.
// O MongoDB limita cada documento a 16 MiB, por isso as sessões longas não podem
// guardar todas as amostras no mesmo documento. O sinal é dividido em vários blocos
// (um documento por bloco) e a Session guarda só quantos blocos tem (chunkCount).
// Os blocos são lidos por ordem de "index" e concatenados para reconstruir o sinal.
const sessionChunkSchema = new mongoose.Schema(
  {
    // Sessão a que o bloco pertence
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    // Utilizador dono da sessão (permite apagar tudo ao eliminar a conta)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Posição do bloco na sessão (0, 1, 2, ...)
    index: {
      type: Number,
      required: true,
      min: 0,
    },
    // Amostras EMG deste bloco
    emgData: {
      type: [Number],
      default: [],
    },
    // Amostras IMU deste bloco (cada elemento é [pitch, roll])
    imuData: {
      type: [[Number]],
      default: [],
    },
    // Parte do envelope RMS deste bloco
    envelope: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

// Um só bloco por posição em cada sessão (reenviar o mesmo bloco substitui-o)
sessionChunkSchema.index({ session: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('SessionChunk', sessionChunkSchema);
