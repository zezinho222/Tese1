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
import { useAuth } from '../context/AuthContext';

const stats = [
  { label: 'Sessões', value: '47' },
  { label: 'Monitorizadas', value: '38h' },
  { label: 'Alertas', value: '95' },
];

const settings = [
  {
    icon: '👤',
    title: 'Dados Pessoais',
    subtitle: 'Nome, email, password',
  },
  {
    icon: '🔔',
    title: 'Notificações',
    subtitle: 'Notificações, vibrações',
  },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('') || 'U';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Utilizador'}</Text>
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
        <View style={styles.settingsCards}>
          {settings.map((s) => (
            <TouchableOpacity
              key={s.title}
              style={styles.card}
              activeOpacity={0.82}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{s.icon}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardSubtitle}>{s.subtitle}</Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setShowLogoutModal(true)}
        >
          <Text style={styles.logoutText}>Terminar Sessão</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Modal de confirmação ── */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        {/* Overlay escuro */}
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowLogoutModal(false)}
        >
          {/* Card do modal — stopPropagation para não fechar ao clicar dentro */}
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <Text style={styles.modalTitle}>Tem a certeza que quer{'\n'}terminar a sessão?</Text>

            {/* Confirmar */}
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={logout}
              activeOpacity={0.85}
            >
              <Text style={styles.modalConfirmText}>Sim, tenho!</Text>
            </TouchableOpacity>

            {/* Cancelar */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowLogoutModal(false)}
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

  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text?.primary ?? '#111827',
    marginTop: 10,
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  scroll: {
    paddingBottom: 32,
  },

  /* ── Avatar ── */
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 60,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0E7FF',
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#4F46E5',
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.white ?? '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border ?? '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text?.primary ?? '#111827',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text?.secondary ?? '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ── Section title ── */
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text?.secondary ?? '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  /* ── Cards ── */
  settingsCards: {
    gap: 12,
    marginBottom: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white ?? '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    paddingRight: 16,
    paddingLeft: 0,
    borderWidth: 1,
    borderColor: colors.border ?? '#E5E7EB',
    overflow: 'hidden',
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
    marginLeft: 10,
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
  cardArrow: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 36,
    marginRight: 4,
  },

  /* ── Logout button ── */
  logoutBtn: {
    backgroundColor: colors.redBackground ?? '#FEF2F2',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    color: colors.text?.red ?? '#DC2626',
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

  /* Confirmar — fundo vermelho suave (sharedStyles.redButton) */
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

  /* Cancelar — fundo branco com borda (sharedStyles.cancelButton) */
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