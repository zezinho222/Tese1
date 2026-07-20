import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import notificationService from '../notificationService';

const SECTIONS = [
  {
    label: 'Alertas de Postura',
    items: [
      { id: 'notifications', title: 'Notificações', subtitle: 'Notificar quando postura incorreta' },
      //{ id: 'vibration', title: 'Vibração', subtitle: 'Vibrar ao detetar risco' },
      { id: 'sound', title: 'Som', subtitle: 'Emitir som de alerta' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      //{ id: 'updates', title: 'Atualizações da App', subtitle: 'Notificar novas versões disponíveis' },
      { id: 'device', title: 'Estado do Dipositivo', subtitle: 'Alertar desconexão do módulo a meio de uma sessão' },
    ],
  },
];

export default function NotificationsPage({ navigation }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  // Carrega as preferências guardadas (ou os valores por omissão, na primeira vez).
  useEffect(() => {
    notificationService.getSettings().then(setSettings);
  }, []);

  const toggle = async (id) => {
    if (!settings) return;
    const next = { ...settings, [id]: !settings[id] };
    setSettings(next);

    // Se o utilizador está a ligar as notificações, pede logo a permissão
    // ao sistema — se recusar, o toggle fica ligado na app mas nenhuma
    // notificação vai realmente aparecer (comportamento normal do SO).
    if (id === 'notifications' && next.notifications) {
      await notificationService.ensurePermission();
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      await notificationService.saveSettings(settings);
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Notificações</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.label}>
            <Text style={styles.sectionLabel}>{section.label}</Text>

            <View style={[sharedStyles.card, styles.groupCard]}>
              {section.items.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingText}>
                      <Text style={styles.settingTitle}>{item.title}</Text>
                      <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                    </View>
                    <Switch
                      value={settings[item.id]}
                      onValueChange={() => toggle(item.id)}
                      trackColor={{ false: colors.border, true: colors.primary + '80' }}
                      thumbColor={ settings[item.id] ? colors.primary : colors.disabled}
                    />
                  </View>
                  {index < section.items.length - 1 && (
                    <View style={styles.divider} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Guardar Alterações */}
      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={sharedStyles.primaryButton}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={sharedStyles.primaryButtonText}>Guardar Alterações</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 0,
  },
  backArrow: {
    fontSize: 32,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 32,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
  },

  /* ── Group card ── */
  groupCard: {
    backgroundColor: colors.white,
    borderWidth: 0,
    padding: 0,
    overflow: 'hidden',
  },

  /* ── Setting row ── */
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingText: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  settingSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },

  /* ── Divider ── */
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },

  /* ── Bottom button ── */
  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});