const express = require('express');
const router = express.Router();

const POLICY_VERSION = '1.0';
const POLICY_DATE = '17 de agosto de 2026';
const POLICY_CONTACT = 'ergocontroluminho@gmail.com';

const SECTIONS = [
  {
    title: 'Quem trata os seus dados',
    paragraphs: [
      'A aplicação ErgoControl foi desenvolvida no âmbito de uma dissertação de mestrado na Universidade do Minho, para monitorização ergonómica através de um dispositivo vestível com sensores de eletromiografia de superfície (sEMG) e de movimento (IMU).',
      `O responsável pelo tratamento dos dados pode ser contactado através do endereço <a href="mailto:${POLICY_CONTACT}">${POLICY_CONTACT}</a>.`,
    ],
  },
  {
    title: 'Que dados recolhemos',
    bullets: [
      '<strong>Dados de conta:</strong> nome, email e, opcionalmente, telemóvel. A password é guardada apenas sob a forma de hash criptográfico, nunca em texto simples.',
      '<strong>Dados de saúde:</strong> sinais sEMG e IMU recolhidos pelo módulo vestível, envolvente RMS calculada, valores de calibração MVC e alertas ergonómicos gerados durante as sessões.',
      '<strong>Dados de utilização:</strong> data, hora, duração e tipo de sensor de cada sessão, e identificação dos módulos associados à conta.',
    ],
    paragraphs: [
      'A aplicação não recolhe a sua localização, os seus contactos, nem dados provenientes de outras aplicações do dispositivo.',
    ],
  },
  {
    title: 'Para que usamos os dados',
    bullets: [
      'Apresentar a monitorização em tempo real e o histórico de sessões.',
      'Calcular a calibração MVC e gerar alertas de fadiga e de postura.',
      'Permitir a exportação das sessões em PDF e CSV.',
      'Autenticar o utilizador, gerir a conta e permitir a recuperação de password.',
    ],
    paragraphs: [
      'Os dados não são usados para publicidade, não são vendidos e não são partilhados com terceiros para fins comerciais.',
    ],
  },
  {
    title: 'Com que fundamento legal',
    paragraphs: [
      'O tratamento assenta no seu consentimento, nos termos do artigo 6.º, n.º 1, alínea a) do RGPD.',
      'Os sinais sEMG e IMU constituem dados relativos à saúde, abrangidos pelo artigo 9.º do RGPD. O seu tratamento assenta no consentimento explícito prestado no momento do registo, nos termos do artigo 9.º, n.º 2, alínea a).',
      'Pode retirar o consentimento a qualquer momento. A retirada do consentimento é feita eliminando a conta, através do ecrã de Perfil, e não afeta a licitude do tratamento efetuado até esse momento.',
    ],
  },
  {
    title: 'Onde ficam guardados os dados',
    bullets: [
      'No seu dispositivo: as sessões são guardadas localmente para permitir o funcionamento sem ligação à Internet, e sincronizadas quando esta fica disponível.',
      'Na nuvem: a base de dados é alojada em MongoDB Atlas e o servidor aplicacional em Render. O envio de emails de verificação e de recuperação de password é feito através do serviço Brevo.',
    ],
    paragraphs: [
      'Estes prestadores atuam como subcontratantes, tratam os dados apenas por nossa conta e estão vinculados a obrigações de confidencialidade. Sempre que exista transferência de dados para fora do Espaço Económico Europeu, esta assenta nas cláusulas contratuais-tipo aprovadas pela Comissão Europeia.',
    ],
  },
  {
    title: 'Durante quanto tempo',
    paragraphs: [
      'Os dados são conservados enquanto a conta existir.',
      'Ao eliminar a conta, a conta, todas as sessões e todos os módulos associados são apagados de forma definitiva do servidor, e os dados guardados localmente no dispositivo são igualmente removidos. A operação é irreversível.',
      'Cópias de segurança da base de dados podem conter os dados por um período residual até 30 dias, findo o qual são igualmente eliminados.',
    ],
  },
  {
    title: 'Os seus direitos',
    bullets: [
      '<strong>Acesso:</strong> consultar os dados que lhe dizem respeito, no ecrã de Dados Pessoais e no Histórico.',
      '<strong>Retificação:</strong> corrigir o nome, o telemóvel, o email e a password.',
      '<strong>Apagamento:</strong> eliminar a conta e todos os dados associados, no ecrã de Perfil.',
      '<strong>Portabilidade:</strong> exportar as sessões em formato PDF ou CSV, a partir do Histórico.',
      '<strong>Limitação e oposição:</strong> solicitar a limitação ou opor-se ao tratamento, através do contacto indicado.',
      '<strong>Retirada do consentimento</strong>, a qualquer momento e sem justificação.',
    ],
    paragraphs: [
      'Tem ainda o direito de apresentar reclamação junto da autoridade de controlo nacional, a Comissão Nacional de Proteção de Dados (CNPD), em <a href="https://www.cnpd.pt" target="_blank" rel="noopener">www.cnpd.pt</a>.',
    ],
  },
  {
    title: 'Segurança',
    bullets: [
      'As passwords são guardadas com bcrypt e nunca são acessíveis em texto simples, nem sequer ao responsável pelo tratamento.',
      'O acesso à conta é feito por token JWT com prazo de validade, e todas as rotas que expõem dados exigem autenticação.',
      'A comunicação entre a aplicação e o servidor é cifrada com HTTPS (TLS 1.2 ou superior).',
    ],
    paragraphs: [
      '<strong>Limitação conhecida:</strong> a ligação direta entre o telemóvel e o módulo vestível é feita por TCP sobre a rede Wi-Fi local criada pelo próprio módulo, sem cifra TLS. Trata-se de uma ligação ponto-a-ponto, de curto alcance e sem encaminhamento para a Internet, pelo que a interceção exigiria proximidade física ao equipamento. A introdução de TLS neste canal está identificada como trabalho futuro.',
    ],
  },
  {
    title: 'Menores',
    paragraphs: [
      'A aplicação não se destina a menores de 18 anos. Caso seja menor, o registo só deve ser feito com autorização e acompanhamento do seu representante legal.',
    ],
  },
  {
    title: 'Alterações a esta política',
    paragraphs: [
      `Esta é a versão ${POLICY_VERSION}, de ${POLICY_DATE}. Qualquer alteração relevante será comunicada dentro da aplicação, sendo pedido novo consentimento sempre que a finalidade do tratamento mudar.`,
    ],
  },
  {
    title: 'Contacto',
    paragraphs: [
      `Para exercer qualquer um dos direitos acima, ou para esclarecer dúvidas sobre o tratamento dos seus dados, escreva para <a href="mailto:${POLICY_CONTACT}">${POLICY_CONTACT}</a>.`,
    ],
  },
];

// Constrói o HTML das secções
function renderSections() {
  return SECTIONS.map((section, index) => {
    const bullets = section.bullets
      ? `<ul>${section.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
      : '';
    const paragraphs = section.paragraphs
      ? section.paragraphs.map((p) => `<p>${p}</p>`).join('')
      : '';
    return `
      <section>
        <h2>${index + 1}. ${section.title}</h2>
        ${bullets}
        ${paragraphs}
      </section>
    `;
  }).join('');
}

// GET /privacidade
router.get('/privacidade', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Política de Privacidade - ErgoControl</title>
      <style>
        :root {
          --primary: #3B82F6;
          --background: #F5F7FA;
          --border: #E5E7EB;
          --text-primary: #1F2937;
          --text-secondary: #6B7280;
          --white: #FFFFFF;
          --radius-lg: 16px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
          background: var(--background);
          color: var(--text-primary);
          padding: 24px 16px 64px;
          line-height: 1.6;
        }
        .wrap {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: 0 2px 8px rgba(229,231,235,0.6), 0 4px 20px rgba(0,0,0,0.06);
          max-width: 720px;
          margin: 0 auto;
          padding: 32px 28px 40px;
        }
        .logo-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-bottom: 24px;
        }
        .logo-row img { height: 64px; width: auto; }
        .logo-label { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
        h1 { font-size: 26px; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.5px; }
        .version { font-size: 13px; color: var(--text-secondary); font-weight: 600; margin-bottom: 28px; }
        section { margin-bottom: 24px; }
        h2 { font-size: 17px; font-weight: 800; margin-bottom: 8px; }
        p { font-size: 15px; color: var(--text-secondary); margin-bottom: 8px; }
        ul { margin: 0 0 8px 20px; }
        li { font-size: 15px; color: var(--text-secondary); margin-bottom: 6px; }
        strong { color: var(--text-primary); }
        a { color: var(--primary); }
        .note {
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.3);
          border-radius: 12px;
          padding: 16px;
          font-size: 14px;
          color: var(--text-secondary);
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="logo-row">
          <img src="/assets/ErgoControl.png" alt="ErgoControl" />
          <span class="logo-label">ErgoControl</span>
        </div>
        <h1>Política de Privacidade</h1>
        <p class="version">Versão ${POLICY_VERSION} &middot; ${POLICY_DATE}</p>
        ${renderSections()}
        <div class="note">
          Pode eliminar a sua conta e todos os dados associados a qualquer
          momento, no ecrã de Perfil da aplicação.
        </div>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;