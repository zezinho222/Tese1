import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
} from 'react-native';
import { colors } from '../utils/shared-Styles';

const initialModules = [
  { id: '1', name: 'Sensor 1', subtitle: 'sEMG e IMU', icon: '⚡', battery: 85, connected: true },
  { id: '2', name: 'Sensor 2', subtitle: 'Unidade de Medição Inercial', icon: '🎯', battery: 45, connected: true },
  { id: '3', name: 'EMS', subtitle: 'Eletroestimulação Muscular', icon: '💪', battery: null, connected: false },
];

const batteryColor = (b) => {
  if (b >= 60) return colors.secondary;
  if (b >= 30) return '#F59E0B';
  return '#ef4444';
};

export default function ModulesPage() {
  const [modules, setModules] = useState(initialModules);
  const [moduleToDisconnect, setModuleToDisconnect] = useState(null);

  const confirmDisconnect = () => {
    setModules(prev =>
      prev.map(m => m.id === moduleToDisconnect ? { ...m, connected: false } : m)
    );
    setModuleToDisconnect(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <Text style={styles.pageTitle}>Módulos</Text>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.moduleCards}>
          {modules.map((m) => (
            <View key={m.id} style={styles.card}>

              <View style={styles.cardHeader}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconText}>{m.icon}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{m.name}</Text>
                  <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
                </View>
                <View style={[styles.badge, m.connected ? styles.badgeOn : styles.badgeOff]}>
                  <Text style={[styles.badgeText, m.connected ? styles.badgeTextOn : styles.badgeTextOff]}>
                    {m.connected ? 'Conectado' : 'Desconectado'}
                  </Text>
                </View>
              </View>

              <View style={styles.batteryRow}>
                <Text style={styles.batteryLabel}>Bateria</Text>
                <View style={styles.batteryBarWrap}>
                  {m.battery !== null && (
                    <View
                      style={[
                        styles.batteryBar,
                        { width: `${m.battery}%`, backgroundColor: batteryColor(m.battery) },
                      ]}
                    />
                  )}
                </View>
                <Text style={[styles.batteryPct, m.battery !== null && { color: batteryColor(m.battery) }]}>
                  {m.battery !== null ? `${m.battery}%` : '-'}
                </Text>
              </View>

              {m.connected && (
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => setModuleToDisconnect(m.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.disconnectText}>Desligar</Text>
                </TouchableOpacity>
              )}

            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.connectBtn} activeOpacity={0.85}>
          <Text style={styles.connectText}>+ Conectar Módulo</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Modal de confirmação ── */}
      <Modal
        visible={moduleToDisconnect !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModuleToDisconnect(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setModuleToDisconnect(null)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <Text style={styles.modalTitle}>Tem a certeza que quer{'\n'}desligar o módulo?</Text>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={confirmDisconnect}
              activeOpacity={0.85}
            >
              <Text style={styles.modalConfirmText}>Sim, tenho!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setModuleToDisconnect(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCancelText}>Não, cancelar!</Text>
            </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },

  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text?.primary ?? '#111827',
    textAlign: 'center',
    paddingVertical: 40,
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
    marginBottom: 28,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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

  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: { backgroundColor: '#D1FAE5' },
  badgeOff: { backgroundColor: colors.border ?? '#E5E7EB' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: colors.secondary },
  badgeTextOff: { color: colors.text?.secondary ?? '#6B7280' },

  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  batteryLabel: {
    fontSize: 13,
    color: colors.text?.secondary ?? '#6B7280',
    width: 50,
  },
  batteryBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border ?? '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  batteryBar: {
    height: 8,
    borderRadius: 4,
  },
  batteryPct: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text?.primary ?? '#111827',
    width: 36,
    textAlign: 'right',
  },

  disconnectBtn: {
    backgroundColor: colors.redBackground ?? '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  disconnectText: {
    color: colors.text?.red ?? '#DC2626',
    fontWeight: '700',
    fontSize: 14,
  },

  connectBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  connectText: {
    color: colors.white ?? '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },

  /* ── Modal overlay ── */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  /* ── Modal card ── */
  modalCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text?.primary ?? '#1F2937',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 4,
  },
  modalConfirmBtn: {
    backgroundColor: colors.redBackground,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: colors.text?.red ?? '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBtn: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  modalCancelText: {
    color: colors.text?.secondary ?? '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});