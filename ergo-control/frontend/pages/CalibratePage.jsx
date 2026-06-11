import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';

const modules = [
  {
    id: 'semg',
    icon: '⚡',
    title: 'sEMG',
    subtitle: 'Eletromiografia de Superfície',
    calibrated: true,
  },
  {
    id: 'imu',
    icon: '🧭',
    title: 'IMU',
    subtitle: 'Unidade de Medição Inercial',
    calibrated: false,
  },
  {
    id: 'ems',
    icon: '💪',
    title: 'EMS',
    subtitle: 'Eletroestimulação Muscular',
    calibrated: false,
  },
];

export default function CalibratePage({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Calibrar</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Módulos</Text>

        <View style={styles.settingsGroup}>
          {modules.map((m) => (
            <View
              key={m.id}
              style={[sharedStyles.card, styles.settingsCard]}
            >
              <View style={[sharedStyles.iconCircle, styles.iconCircle]}>
                <Text style={sharedStyles.iconText}>{m.icon}</Text>
              </View>

              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{m.title}</Text>
                <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
              </View>

              {m.calibrated ? (
                <View style={styles.okBadge}>
                  <Text style={styles.okBadgeText}>OK</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.calibrateBtn} activeOpacity={0.85}>
                  <Text style={styles.calibrateBtnText}>Calibrar</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    paddingBottom: 32,
  },

  /* ── Section label ── */
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  /* ── Cards — identical to ProfilePage settingsGroup / settingsCard ── */
  settingsGroup: {
    gap: 12,
  },
  settingsCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingRight: 16,
    borderWidth: 1,
  },
  iconCircle: {
    marginRight: 14,
    marginLeft: 10,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },

  /* ── Calibrated badge ── */
  okBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  okBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary,
  },

  /* ── Calibrar button ── */
  calibrateBtn: {
    backgroundColor: colors.yellowBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.text.yellow,
  },
  calibrateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.yellow,
  },
});