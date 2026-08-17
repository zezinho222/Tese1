import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import syncService from '../syncService';
import { api } from '../api';

// Converte segundos totais de monitorização em algo tipo "38h 20m" ou "45m"
function formatTotalDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

const settings = [
  {
    icon: '👤',
    title: 'Dados Pessoais',
    subtitle: 'Nome, email, password',
    route: 'PersonalData',
  },
  {
    icon: '🔔',
    title: 'Notificações',
    subtitle: 'Notificações, vibrações',
    route: 'Notifications',
  },
  {
    icon: '🔒',
    title: 'Privacidade',
    subtitle: 'Política de privacidade e dados',
    route: 'Privacy',
  },
];

// Página de Perfil
export default function ProfilePage({ navigation }) {
  const { user, token, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Sessões', value: '-' },
    { label: 'Monitorizadas', value: '-' },
    { label: 'Alertas', value: '-' },
  ]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Carrega estatísticas de sessões e alertas do utilizador
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const sessions = await syncService.getMergedSessions(token);
      const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
      const totalAlerts = sessions.reduce((sum, s) => sum + (s.alertCount || 0), 0);
      setStats([
        { label: 'Sessões', value: String(sessions.length) },
        { label: 'Monitorizadas', value: formatTotalDuration(totalDuration) },
        { label: 'Alertas', value: String(totalAlerts) },
      ]);
    } catch {
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const closeDeleteModal = () => {
    if (deleting) return;
    setShowDeleteModal(false);
    setDeleteStep(1);
    setDeletePassword('');
    setDeleteError('');
  };

  // Pede a password ao utilizador antes de eliminar
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Introduza a sua password.');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      const online = await syncService.hasInternet();
      if (!online) {
        setDeleteError(
          'Ligue-se a uma rede Wi-Fi com Internet para conseguir eliminar definitivamente a conta.'
        );
        return;
      }

      const data = await api.deleteAccount(token, { password: deletePassword });

      if (!data.success) {
        setDeleteError(data.message || 'Não foi possível eliminar a conta.');
        return;
      }

      await syncService.clearAllLocalData();
      await logout();
    } catch {
      setDeleteError('Erro de ligação. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('') || 'U';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Utilizador'}</Text>
        </View>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={[sharedStyles.card, styles.statItem]}>
              {statsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.statValue}>{s.value}</Text>
              )}
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Definições</Text>
        <View style={styles.settingsGroup}>
          {settings.map((s) => (
            <TouchableOpacity
              key={s.title}
              style={[sharedStyles.card, styles.settingsCard]}
              activeOpacity={0.82}
              onPress={() => navigation.navigate(s.route)}
            >
              <View style={[sharedStyles.iconCircle, styles.iconCircle]}>
                <Text style={sharedStyles.iconText}>{s.icon}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardSubtitle}>{s.subtitle}</Text>
              </View>
              <Text style={sharedStyles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[sharedStyles.redButton, styles.logoutBtn]}
          onPress={() => setShowLogoutModal(true)}
        >
          <Text style={sharedStyles.redText}>Terminar Sessão</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[sharedStyles.redButton, styles.logoutBtn, styles.deleteBtn]}
          onPress={() => setShowDeleteModal(true)}
        >
          <Text style={sharedStyles.redText}>Eliminar Conta</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Terminar sessão */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowLogoutModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <Text style={styles.modalTitle}>Tem a certeza que quer{'\n'}terminar a sessão?</Text>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton, styles.modalBtn]}
              onPress={logout}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.confirmButtonText}>Sim, tenho!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
              onPress={() => setShowLogoutModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Não, cancelar!</Text>
            </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Eliminar conta */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={closeDeleteModal}
          >
            <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

              {deleteStep === 1 ? (
                <>
                  <Text style={styles.modalTitle}>Tem a certeza que quer{'\n'}eliminar a conta?</Text>

                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      Esta ação é irreversível. São eliminados de forma
                      definitiva a sua conta, todas as sessões de monitorização
                      e todos os módulos associados, tanto no servidor como
                      neste dispositivo.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[sharedStyles.primaryButton, sharedStyles.confirmButton, styles.modalBtn]}
                    onPress={() => setDeleteStep(2)}
                    activeOpacity={0.85}
                  >
                    <Text style={sharedStyles.confirmButtonText}>Sim, tenho!</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
                    onPress={closeDeleteModal}
                    activeOpacity={0.85}
                  >
                    <Text style={sharedStyles.cancelButtonText}>Não, cancelar!</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>Confirme a sua password</Text>

                  <Text style={styles.modalSubtitle}>
                    Para eliminar a conta, introduza a password que usa para
                    entrar na aplicação.
                  </Text>

                  <TextInput
                    style={[
                      sharedStyles.input,
                      styles.passwordInput,
                      deleteError && styles.inputError,
                    ]}
                    placeholder="Password"
                    placeholderTextColor={colors.text.placeholder}
                    value={deletePassword}
                    onChangeText={(v) => { setDeletePassword(v); setDeleteError(''); }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!deleting}
                  />

                  {deleteError ? (
                    <Text style={styles.modalError}>{deleteError}</Text>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      sharedStyles.primaryButton,
                      sharedStyles.confirmButton,
                      styles.modalBtn,
                      (!deletePassword || deleting) && sharedStyles.buttonDisabled,
                    ]}
                    onPress={handleDeleteAccount}
                    disabled={!deletePassword || deleting}
                    activeOpacity={0.85}
                  >
                    {deleting ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={sharedStyles.confirmButtonText}>
                        Eliminar definitivamente
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
                    onPress={closeDeleteModal}
                    disabled={deleting}
                    activeOpacity={0.85}
                  >
                    <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              )}

            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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
  scroll: {
    paddingBottom: 32,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 60,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 10,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    backgroundColor: colors.white,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  settingsGroup: {
    gap: 12,
    marginBottom: 28,
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
  logoutBtn: {
    paddingVertical: 16,
    borderRadius: 18,
    marginHorizontal: 0,
    marginTop: 0,
  },
  deleteBtn: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.text.red,
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
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: -8,
  },
  modalBtn: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingVertical: 15,
  },
  warningBox: {
    backgroundColor: colors.redBackground,
    borderRadius: 12,
    padding: 14,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.red,
    fontWeight: '500',
  },
  passwordInput: {
    marginTop: 2,
  },
  inputError: {
    borderColor: colors.text.red,
    backgroundColor: colors.redBackground,
  },
  modalError: {
    fontSize: 13,
    color: colors.text.red,
    textAlign: 'center',
    marginTop: -6,
    fontWeight: '500',
  },
});