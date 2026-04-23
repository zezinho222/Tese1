import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import { colors } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';

const stats = [
  { label: 'Sessões', value: '47' },
  { label: 'Monitorizadas', value: '38h' },
  { label: 'Alertas', value: '95' },
];

const settings = [
  { icon: '👤', title: 'Dados Pessoais', subtitle: 'Nome, email, password' },
  { icon: '🔔', title: 'Notificações', subtitle: 'Notificações, vibrações' },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('') || 'U';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name || 'Utilizador'}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Definições */}
        <Text style={styles.sectionTitle}>Definições</Text>
        <View style={styles.settingsCard}>
          {settings.map((s, i) => (
            <TouchableOpacity key={s.title} style={[styles.settingRow, i > 0 && styles.settingBorder]}>
              <View style={styles.settingIcon}>
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>{s.title}</Text>
                <Text style={styles.settingSubtitle}>{s.subtitle}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>↪ Terminar Sessão</Text>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primary, justifyContent: 'center',
    alignItems: 'center', marginBottom: 10,
  },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  statLabel: { fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  sectionTitle: {
    fontSize: 14, fontWeight: '600', color: colors.text.secondary, marginBottom: 10,
  },
  settingsCard: {
    backgroundColor: colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
  },
  settingBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  settingIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.background, justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  settingText: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  settingSubtitle: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  arrow: { fontSize: 18, color: colors.text.secondary },
  logoutBtn: {
    backgroundColor: colors.redBackground, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  logoutText: { color: colors.text.red, fontWeight: '600', fontSize: 15 },
});