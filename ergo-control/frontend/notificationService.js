/**
 * notificationService.js
 * Notificações locais (sem servidor) para alertas de postura/esforço e
 * estado do dispositivo, com as preferências geridas em NotificationsPage
 * e guardadas em AsyncStorage — para não dependerem de estar com a app
 * aberta nem de haver internet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const SETTINGS_KEY = '@ergocontrol/notification_settings';

const DEFAULT_SETTINGS = {
  notifications: true, // Alertas de Postura → Notificações
  sound: false,        // Alertas de Postura → Som
  device: true,        // Sistema → Estado do Dispositivo
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // decidido dinamicamente por notificação (ver send() abaixo)
    shouldSetBadge: false,
  }),
});

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
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: sound ? 'default' : undefined },
    trigger: null, // imediata
  });
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
