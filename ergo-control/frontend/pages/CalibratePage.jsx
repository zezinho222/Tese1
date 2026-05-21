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

const ORANGE = '#F59E0B';

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
        <View style={styles.backBtn} />
        </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionTitle}>Módulos</Text>

        <View style={styles.moduleCards}>
          {modules.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{m.icon}</Text>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  backBtn: {
  padding: 8,
  width: 50,           
  height: 50,
  alignItems: 'center',
  justifyContent: 'center',
},
  backArrow: {
    fontSize: 32,
    color: colors.text?.primary ?? '#111827',
    fontWeight: '600',
    lineHeight: 32, 
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text?.primary ?? '#111827',
    textAlign: 'center',
  },

  scroll: {
    paddingBottom: 32,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text?.secondary ?? '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  moduleCards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white ?? '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.border ?? '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 26,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text?.primary ?? '#111827',
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text?.secondary ?? '#6B7280',
    marginTop: 3,
  },

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

  calibrateBtn: {
    backgroundColor: colors.yellowBackground ?? '#FFF3CD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ORANGE,
  },
  calibrateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: ORANGE,
  },
});