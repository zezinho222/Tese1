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
import { colors, sharedStyles } from '../utils/shared-Styles';

const initialModules = [
  { id: '1', name: 'Sensor 1', subtitle: 'sEMG e IMU', icon: '⚡', battery: 85, connected: true },
  { id: '2', name: 'Sensor 2', subtitle: 'Unidade de Medição Inercial', icon: '🎯', battery: 45, connected: true },
  { id: '3', name: 'EMS', subtitle: 'Eletroestimulação Muscular', icon: '💪', battery: null, connected: false },
];

const batteryColor = (b) => {
  if (b >= 60) return colors.secondary;
  if (b >= 30) return colors.text.yellow;
  return colors.text.red;
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
            <View key={m.id} style={[sharedStyles.card, styles.card]}>

              <View style={styles.cardHeader}>
                <View style={[sharedStyles.iconCircle, styles.iconCircle]}>
                  <Text style={sharedStyles.iconText}>{m.icon}</Text>
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
                  style={[sharedStyles.redButton, styles.disconnectBtn]}
                  onPress={() => setModuleToDisconnect(m.id)}
                  activeOpacity={0.85}
                >
                  <Text style={sharedStyles.redText}>Desligar</Text>
                </TouchableOpacity>
              )}

            </View>
          ))}
        </View>

        <TouchableOpacity style={sharedStyles.primaryButton} activeOpacity={0.85}>
          <Text style={sharedStyles.primaryButtonText}>+ Conectar Módulo</Text>
        </TouchableOpacity>

      </ScrollView>

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
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton]}
              onPress={confirmDisconnect}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.confirmButtonText}>Sim, tenho!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={() => setModuleToDisconnect(null)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Não, cancelar!</Text>
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
    color: colors.text.primary,
    textAlign: 'center',
    paddingVertical: 40,
  },

  scroll: {
    paddingBottom: 32,
  },

  moduleCards: {
    gap: 12,
    marginBottom: 28,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
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
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
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

  disconnectBtn: {
  paddingVertical: 12,
  borderRadius: 18,
  marginHorizontal: 0,
  marginTop: 0,
},

  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: { backgroundColor: '#D1FAE5' },
  badgeOff: { backgroundColor: colors.border },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: colors.secondary },
  badgeTextOff: { color: colors.text.secondary },

  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  batteryLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    width: 50,
  },
  batteryBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
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
    color: colors.text.primary,
    width: 36,
    textAlign: 'right',
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  modalCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 4,
  },
});