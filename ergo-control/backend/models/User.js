const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome é obrigatório'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'O email é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'Email inválido'],
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    password: {
      type: String,
      required: [true, 'A password é obrigatória'],
      minlength: [8, 'A password deve ter pelo menos 8 caracteres'],
      select: false,
    },
    // Reset de password (forgot password - sem autenticação)
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    // Alteração de email (requer autenticação + verificação por email)
    emailChangeToken: {
      type: String,
      default: null,
    },
    emailChangePending: {
      type: String,
      default: null,
    },
    emailChangeExpires: {
      type: Date,
      default: null,
    },
    // Alteração de password (requer autenticação + verificação por email)
    passwordChangeToken: {
      type: String,
      default: null,
    },
    passwordChangeExpires: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash da password antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);