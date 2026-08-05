import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const SETTINGS_KEY = '@ergocontrol/notification_settings';
const CHANNEL_ID = 'ergocontrol-alerts';

const DEFAULT_SETTINGS = {
  notifications: true, // Notificações
  sound: false,        // Som
  device: true,        // Estado do Dispositivo
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: !!notification?.request?.content?.sound,
    shouldSetBadge: false,
  }),
});

// Cria o canal de notificações do Android (obrigatório a partir do Android 8)
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

// Verifica se já há permissão de notificações
async function ensurePermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (permissionRequested) return false; // já perguntámos nesta sessão, não insistir
  permissionRequested = true;
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === 'granted';
}

// Le as preferências de notificações guardadas no AsyncStorage
async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Guarda as preferências de notificações no AsyncStorage
async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Envia uma notificação (se houver permissão)
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

// Manda uma notificação dealerta
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

// Manda uma notificação sobre o estado do dispositivo
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
