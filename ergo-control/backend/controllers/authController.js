const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// Função auxiliar para gerar JWT
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Função auxiliar para enviar email
const sendEmail = async ({ to, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

// ─── POST /api/auth/register ───────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validações básicas
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e password são obrigatórios.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A password deve ter pelo menos 8 caracteres.',
      });
    }

    // Verificar se o email já existe
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Este email já está registado.',
      });
    }

    // Criar utilizador (a password é hasheada automaticamente pelo model)
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      password,
    });

    // Gerar token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Erro no registo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor.',
    });
  }
};

// ─── POST /api/auth/login ──────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validações básicas
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e password são obrigatórios.',
      });
    }

    // Buscar utilizador com a password (select: false no model)
    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select('+password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Email ou password incorretos.',
      });
    }

    // Verificar password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Email ou password incorretos.',
      });
    }

    // Gerar token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login efetuado com sucesso!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor.',
    });
  }
};

// ─── POST /api/auth/forgot-password ───────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'O email é obrigatório.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Resposta genérica por segurança (não revelar se o email existe)
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'Se o email existir, receberá instruções em breve.',
      });
    }

    // Gerar token de reset (token aleatório, não JWT)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Guardar token hasheado na base de dados (expira em 15 minutos)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // Link de reset (aponta para o frontend/deep link da app)
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'ErgoControl - Recuperação de Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3B82F6;">Recuperação de Password</h2>
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Recebemos um pedido para redefinir a password da sua conta ErgoControl.</p>
            <p>Clique no botão abaixo para criar uma nova password:</p>
            <a href="${resetUrl}"
               style="display:inline-block; padding:12px 24px; background:#3B82F6;
                      color:white; text-decoration:none; border-radius:8px; margin:16px 0;">
              Redefinir Password
            </a>
            <p style="color:#6B7280; font-size:14px;">
              Este link é válido por <strong>15 minutos</strong>.<br/>
              Se não pediu a recuperação, ignore este email.
            </p>
          </div>
        `,
      });

      res.status(200).json({
        success: true,
        message: 'Se o email existir, receberá instruções em breve.',
      });
    } catch (emailError) {
      // Se o email falhar, limpar o token guardado
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save({ validateBeforeSave: false });

      console.error('Erro ao enviar email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar email. Tente novamente mais tarde.',
      });
    }
  } catch (error) {
    console.error('Erro no forgot-password:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor.',
    });
  }
};

// ─── POST /api/auth/reset-password/:token ─────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A password deve ter pelo menos 8 caracteres.',
      });
    }

    // Hash do token recebido para comparar com o da base de dados
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Encontrar utilizador com token válido e não expirado
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido ou expirado.',
      });
    }

    // Atualizar a password e limpar o token
    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password alterada com sucesso! Pode agora fazer login.',
    });
  } catch (error) {
    console.error('Erro no reset-password:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor.',
    });
  }
};

// ─── GET /api/auth/me ──────────────────────────────────────────────────────
// Rota protegida - retorna dados do utilizador autenticado
const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
    },
  });
};

module.exports = { register, login, forgotPassword, resetPassword, getMe };