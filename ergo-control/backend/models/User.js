const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Esquema dos utilizadores na base de dados
const userSchema = new mongoose.Schema(
  {
    // Nome do utilizador
    name: {
      type: String,
      required: [true, 'O nome é obrigatório'],
      trim: true,
    },
    // Email do utilizador
    email: {
      type: String,
      required: [true, 'O email é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'Email inválido'],
    },
    // Telefone do utilizador(opcional)
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    // Password do utilizador
    password: {
      type: String,
      required: [true, 'A password é obrigatória'],
      minlength: [8, 'A password deve ter pelo menos 8 caracteres'],
      select: false,
    },
    // Reset de password
    passwordResetToken: {
      type: String,
      default: null,
    },
    // Data de expiração do reset de password
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    // Alteração de email
    emailChangeToken: {
      type: String,
      default: null,
    },
    // Email novo a confirmar
    emailChangePending: {
      type: String,
      default: null,
    },
    // Data de expiração da alteração de email
    emailChangeExpires: {
      type: Date,
      default: null,
    },
    // Alteração de password
    passwordChangeToken: {
      type: String,
      default: null,
    },
    // Data de expiração da alteração de password
    passwordChangeExpires: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    consent: {
      accepted:      { type: Boolean, default: false },
      acceptedAt:    { type: Date,    default: null },
      policyVersion: { type: String,  default: null },
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