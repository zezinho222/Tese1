import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView,
} from 'react-native';
import { colors } from '../utils/shared-Styles';

const initialModules = [
  { id: '1', name: 'Sensor 1', subtitle: 'sEMG e IMU', icon: '⚡', battery: 85, connected: true },
  { id: '2', name: 'Sensor 2', subtitle: 'Unidade de Medição Inercial', icon: '🎯', battery: 45, connected: true },
  { id: '3', name: 'EMS', subtitle: 'Eletroestimulação Muscular', icon: '💪', battery: null, connected: false },
];

export default function ModulesPage() {
  const [modules, setModules] = useState(initialModules);

  const toggle = (id) => {
    setModules(prev => prev.map(m =>
      m.id === id ? { ...m, connected: !m.connected } : m
    ));
  };

  const batteryColor = (b) => {
    if (b >= 60) return colors.secondary;
    if (b >= 30) return '#F59E0B';
    return '#ef4444';
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Módulos</Text>
      <ScrollView contentContainerStyle={styles.scroll}>
        {modules.map((m) => (
          <View key={m.id} style={[styles.card, m.connected && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{m.icon}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.subtitle}>{m.subtitle}</Text>
              </View>
              <View style={[styles.badge, m.connected ? styles.badgeOn : styles.badgeOff]}>
                <Text style={[styles.badgeText, m.connected ? styles.badgeTextOn : styles.badgeTextOff]}>
                  {m.connected ? 'Conectado' : 'Desconectado'}
                </Text>
              </View>
            </View>

            <View style={styles.batteryRow}>
              <Text style={styles.batteryLabel}>Bateria</Text>
              {m.battery !== null ? (
                <View style={styles.batteryBarWrap}>
                  <View style={[styles.batteryBar, { width: `${m.battery}%`, backgroundColor: batteryColor(m.battery) }]} />
                </View>
              ) : (
                <View style={styles.batteryBarWrap} />
              )}
              <Text style={[styles.batteryPct, m.battery ? { color: batteryColor(m.battery) } : {}]}>
                {m.battery !== null ? `${m.battery}%` : '-'}
              </Text>
            </View>

            {m.connected && (
              <TouchableOpacity
                style={styles.disconnectBtn}
                onPress={() => toggle(m.id)}
              >
                <Text style={styles.disconnectText}>Desligar</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.connectBtn}>
          <Text style={styles.connectText}>+ Conectar Módulo</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: {
    fontSize: 20, fontWeight: '700', color: colors.text.primary,
    textAlign: 'center', paddingVertical: 16,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: colors.white, borderRadius: 16,
    padding: 16, borderWidth: 1.5, borderColor: colors.border,
  },
  cardActive: { borderColor: colors.primary },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.background, justifyContent: 'center',
    alignItems: 'center', marginRight: 10,
  },
  iconText: { fontSize: 22 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  subtitle: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeOn: { backgroundColor: '#D1FAE5' },
  badgeOff: { backgroundColor: colors.border },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: colors.secondary },
  badgeTextOff: { color: colors.text.secondary },
  batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  batteryLabel: { fontSize: 13, color: colors.text.secondary, width: 50 },
  batteryBarWrap: {
    flex: 1, height: 8, backgroundColor: colors.border,
    borderRadius: 4, overflow: 'hidden',
  },
  batteryBar: { height: 8, borderRadius: 4 },
  batteryPct: { fontSize: 13, fontWeight: '600', color: colors.text.primary, width: 36, textAlign: 'right' },
  disconnectBtn: {
    backgroundColor: colors.redBackground, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  disconnectText: { color: colors.text.red, fontWeight: '600', fontSize: 14 },
  connectBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  connectText: { color: colors.white, fontWeight: '600', fontSize: 16 },
});