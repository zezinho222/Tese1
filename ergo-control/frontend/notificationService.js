/**
 * notificationService.js
 * Notificações locais (sem servidor) para alertas de postura/esforço e
 * estado do dispositivo, com as preferências geridas em NotificationsPage
 * e guardadas em AsyncStorage — para não dependerem de estar com a app
 * aberta nem de haver internet.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const SETTINGS_KEY = '@ergocontrol/notification_settings';
const CHANNEL_ID = 'ergocontrol-alerts';

const DEFAULT_SETTINGS = {
  notifications: true, // Alertas de Postura → Notificações
  sound: false,        // Alertas de Postura → Som
  device: true,        // Sistema → Estado do Dispositivo
};

Notifications.setNotificationHandler({
  // shouldPlaySound tem de ser lido do próprio pedido de notificação — se
  // ficar fixo em false, nenhuma notificação toca som enquanto a app está em
  // primeiro plano (é precisamente quando os alertas de postura disparam,
  // durante a monitorização), independentemente do toggle "Som" estar ativo.
  // Usa optional chaining: se o handler lançar uma exceção aqui, o
  // expo-notifications não mostra NADA (nem o banner) — ver
  // NotificationsHandler.js, o catch chama handleError em vez de mostrar.
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: !!notification?.request?.content?.sound,
    shouldSetBadge: false,
  }),
});

// Android 8+ ignora o campo "sound" do pedido se o canal usado não tiver som
// configurado — canais não podem ser reconfigurados depois de criados, por
// isso criamos um canal próprio (em vez de usar o "default" do Expo, que
// pode já ter sido criado sem som numa instalação anterior).
// Promise cacheada e aguardada em send() antes de agendar — criá-lo apenas
// "fire-and-forget" ao carregar o módulo arriscava agendar notificações com
// channelId ainda inexistente (canal não pronto), que o Android descarta em
// silêncio sem mostrar nada.
let androidChannelPromise = null;
function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!androidChannelPromise) {
    androidChannelPromise = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Alertas ErgoControl',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    }).catch((e) => {
      console.warn('[notificationService] Falha ao criar canal Android:', e);
    });
  }
  return androidChannelPromise;
}

let permissionRequested = false;

async function ensurePermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (permissionRequested) return false; // já perguntámos nesta sessão, não insistir
  permissionRequested = true;
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === 'granted';
}

async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function send(title, body, { sound } = {}) {
  const granted = await ensurePermission();
  if (!granted) return;
  await ensureAndroidChannel();
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: sound ? 'default' : undefined,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null, // imediata
    });
  } catch (e) {
    console.warn('[notificationService] Falha ao agendar notificação:', e);
  }
}

/** Alerta de sEMG/IMU confirmado durante uma monitorização (ver MonitoringPage). */
async function notifyAlert(kind) {
  const settings = await getSettings();
  if (!settings.notifications) return;

  const messages = {
    emg: ['Esforço muscular elevado', 'O sinal sEMG ultrapassou o limite.'],
    imu: ['Postura incorreta', 'O ângulo do sensor IMU ultrapassou o limite.'],
  };
  const [title, body] = messages[kind] || ['Alerta', 'Limite ultrapassado durante a monitorização.'];
  await send(title, body, { sound: settings.sound });
}

/** Estado do dispositivo — ex: módulo desligou-se inesperadamente a meio de uma sessão. */
async function notifyDevice(title, body) {
  const settings = await getSettings();
  if (!settings.device) return;
  await send(title, body, { sound: settings.sound });
}

export const notificationService = {
  getSettings,
  saveSettings,
  notifyAlert,
  notifyDevice,
  ensurePermission,
};

export default notificationService;
