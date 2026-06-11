const crypto = require('crypto');
const User = require('../models/User');

// Função auxiliar para enviar email (já existe no authController, reutilizamos)
const sendEmail = async ({ to, subject, html }) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: 'ergocontroluminho@gmail.com', name: 'ErgoControl' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(JSON.stringify(error));
  }
};

// ─── GET /api/user/me ──────────────────────────────────────────────────────
// Retorna dados do perfil do utilizador autenticado
const getProfile = async (req, res) => {
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

// ─── PUT /api/user/profile ─────────────────────────────────────────────────
// Atualiza nome e telemóvel (sem verificação por email)
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'O nome é obrigatório.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
    }

    user.name = name.trim();
    user.phone = phone ? phone.trim() : null;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── POST /api/user/request-email-change ──────────────────────────────────
// Envia email de verificação para alterar o email
const requestEmailChange = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Email inválido.' });
    }

    // Verificar se o novo email já está em uso
    const existing = await User.findOne({ email: newEmail.toLowerCase() });
    if (existing && existing._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({ success: false, message: 'Este email já está em uso.' });
    }

    const user = await User.findById(req.user._id);

    // Gerar token de verificação
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    user.emailChangeToken = hashedToken;
    user.emailChangePending = newEmail.toLowerCase().trim();
    user.emailChangeExpires = Date.now() + 15 * 60 * 1000; // 15 minutos
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email-change/${token}`;

    await sendEmail({
      to: req.user.email,
      subject: 'ErgoControl - Confirmar alteração de email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Confirmar alteração de email</h2>
          <p>Olá, <strong>${req.user.name}</strong>!</p>
          <p>Recebemos um pedido para alterar o email da sua conta ErgoControl para:</p>
          <p style="background:#F5F7FA;padding:12px;border-radius:8px;font-weight:600;">${newEmail}</p>
          <p>Clique no botão abaixo para confirmar esta alteração:</p>
          <a href="${verifyUrl}"
             style="display:inline-block;padding:12px 24px;background:#3B82F6;
                    color:white;text-decoration:none;border-radius:8px;margin:16px 0;">
            Confirmar alteração de email
          </a>
          <p style="color:#6B7280;font-size:14px;">
            Este link é válido por <strong>15 minutos</strong>.<br/>
            Se não pediu esta alteração, ignore este email.
          </p>
        </div>
      `,
    });

    res.status(200).json({
      success: true,
      message: 'Email de verificação enviado. Verifique a sua caixa de entrada.',
    });
  } catch (error) {
    console.error('Erro ao solicitar alteração de email:', error);
    res.status(500).json({ success: false, message: 'Erro ao enviar email. Tente novamente.' });
  }
};

// ─── POST /api/user/verify-email-change/:token ────────────────────────────
// Confirma a alteração de email via token
const verifyEmailChange = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailChangeToken: hashedToken,
      emailChangeExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token inválido ou expirado.' });
    }

    user.email = user.emailChangePending;
    user.emailChangeToken = null;
    user.emailChangePending = null;
    user.emailChangeExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email alterado com sucesso! Podes fazer login com o novo email.',
    });
  } catch (error) {
    console.error('Erro ao verificar alteração de email:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

// ─── POST /api/user/request-password-change ───────────────────────────────
// Envia email de verificação para alterar a password
const requestPasswordChange = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordChangeToken = hashedToken;
    user.passwordChangeExpires = Date.now() + 15 * 60 * 1000; // 15 minutos
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${process.env.CLIENT_URL}/verify-password-change/${token}`;

    await sendEmail({
      to: user.email,
      subject: 'ErgoControl - Confirmar alteração de password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Confirmar alteração de password</h2>
          <p>Olá, <strong>${user.name}</strong>!</p>
          <p>Recebemos um pedido para alterar a password da sua conta ErgoControl.</p>
          <p>Clique no botão abaixo para confirmar e definir a nova password:</p>
          <a href="${verifyUrl}"
             style="display:inline-block;padding:12px 24px;background:#3B82F6;
                    color:white;text-decoration:none;border-radius:8px;margin:16px 0;">
            Alterar password
          </a>
          <p style="color:#6B7280;font-size:14px;">
            Este link é válido por <strong>15 minutos</strong>.<br/>
            Se não pediu esta alteração, ignore este email.
          </p>
        </div>
      `,
    });

    res.status(200).json({
      success: true,
      message: 'Email de verificação enviado. Verifique a sua caixa de entrada.',
    });
  } catch (error) {
    console.error('Erro ao solicitar alteração de password:', error);
    res.status(500).json({ success: false, message: 'Erro ao enviar email. Tente novamente.' });
  }
};

// ─── POST /api/user/verify-password-change/:token ─────────────────────────
// Confirma a alteração de password via token (página web)
const verifyPasswordChange = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A password deve ter pelo menos 8 caracteres.',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordChangeToken: hashedToken,
      passwordChangeExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token inválido ou expirado.' });
    }

    user.password = password;
    user.passwordChangeToken = null;
    user.passwordChangeExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password alterada com sucesso! Podes fazer login com a nova password.',
    });
  } catch (error) {
    console.error('Erro ao verificar alteração de password:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordChange,
  verifyPasswordChange,
};