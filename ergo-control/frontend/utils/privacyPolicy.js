export const POLICY_VERSION = '1.0';
export const POLICY_DATE = '17 de agosto de 2026';

// Contacto do responsável pelo tratamento
export const POLICY_CONTACT = 'ergocontroluminho@gmail.com';

// Texto da checkbox no registo (consentimento explícito para dados de saúde)
export const CONSENT_TEXT =
  'Li e aceito a Política de Privacidade e consinto expressamente no tratamento ' +
  'dos meus dados de saúde (sinais sEMG e IMU) para efeitos de monitorização ergonómica.';

export const POLICY_SECTIONS = [
  {
    title: 'Quem trata os seus dados',
    paragraphs: [
      'A aplicação ErgoControl foi desenvolvida no âmbito de uma dissertação de mestrado na Universidade do Minho, para monitorização ergonómica através de um dispositivo vestível com sensores de eletromiografia de superfície (sEMG) e de movimento (IMU).',
      `O responsável pelo tratamento dos dados pode ser contactado através do endereço ${POLICY_CONTACT}.`,
    ],
  },
  {
    title: 'Que dados recolhemos',
    bullets: [
      'Dados de conta: nome, email e, opcionalmente, telemóvel. A password é guardada apenas sob a forma de hash criptográfico, nunca em texto simples.',
      'Dados de saúde: sinais sEMG e IMU recolhidos pelo módulo vestível, envolvente RMS calculada, valores de calibração MVC e alertas ergonómicos gerados durante as sessões.',
      'Dados de utilização: data, hora, duração e tipo de sensor de cada sessão, e identificação dos módulos associados à conta.',
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
      'Acesso: consultar os dados que lhe dizem respeito, no ecrã de Dados Pessoais e no Histórico.',
      'Retificação: corrigir o nome, o telemóvel, o email e a password.',
      'Apagamento: eliminar a conta e todos os dados associados, no ecrã de Perfil.',
      'Portabilidade: exportar as sessões em formato PDF ou CSV, a partir do Histórico.',
      'Limitação e oposição: solicitar a limitação ou opor-se ao tratamento, através do contacto indicado.',
      'Retirada do consentimento, a qualquer momento e sem justificação.',
    ],
    paragraphs: [
      'Tem ainda o direito de apresentar reclamação junto da autoridade de controlo nacional, a Comissão Nacional de Proteção de Dados (CNPD), em www.cnpd.pt.',
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
      'Limitação conhecida: a ligação direta entre o telemóvel e o módulo vestível é feita por TCP sobre a rede Wi-Fi local criada pelo próprio módulo, sem cifra TLS. Trata-se de uma ligação ponto-a-ponto, de curto alcance e sem encaminhamento para a Internet, pelo que a interceção exigiria proximidade física ao equipamento. A introdução de TLS neste canal está identificada como trabalho futuro.',
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
      `Para exercer qualquer um dos direitos acima, ou para esclarecer dúvidas sobre o tratamento dos seus dados, escreva para ${POLICY_CONTACT}.`,
    ],
  },
];