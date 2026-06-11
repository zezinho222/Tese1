import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

// ─── Componente de linha de campo ─────────────────────────────────────────
function FieldRow({ label, value, onChange, placeholder, keyboardType, editable, secureTextEntry }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {secureTextEntry ? (
        <Text style={[styles.fieldInput, styles.fieldInputDisabled]}>••••••••••</Text>
      ) : (
        <TextInput
          style={[styles.fieldInput, !editable && styles.fieldInputDisabled]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.text.placeholder}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          editable={editable}
        />
      )}
    </View>
  );
}

// ─── Componente de linha de campo sensível (email / password no modo edição) ──
function SensitiveFieldRow({ label, currentValue, onRequestChange, loading }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.sensitiveRight}>
        {currentValue ? (
          <Text style={styles.sensitiveValue} numberOfLines={1}>{currentValue}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.alterarBtn, loading && styles.alterarBtnDisabled]}
          onPress={onRequestChange}
          disabled={loading}
          activeOpacity={0.75}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.alterarBtnText}>Alterar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────
export default function PersonalDataPage({ navigation }) {
  const { user, token, login } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  // Estado para modais
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Estado para o modal de alteração de email
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  // Estado para o pedido de alteração de password
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSent, setPasswordSent] = useState(false);

  // ─── Carregar dados da DB ao entrar na página ──────────────────────────
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await api.getProfile(token);
        if (data.success) {
          setName(data.user.name || '');
          setPhone(data.user.phone || '');
          setEmail(data.user.email || '');
          // Atualizar o contexto de autenticação com dados frescos
          await login(data.user, token);
        }
      } catch (e) {
        console.error('Erro ao carregar perfil:', e);
      } finally {
        setFetchLoading(false);
      }
    };
    loadProfile();
  }, []);

  // ─── Guardar nome e telemóvel ──────────────────────────────────────────
  const handleSave = async () => {
    setShowConfirmModal(false);
    setLoading(true);
    try {
      const data = await api.updateProfile(token, { name, phone });
      if (data.success) {
        await login(data.user, token);
        setEditing(false);
      } else {
        Alert.alert('Erro', data.message || 'Não foi possível guardar as alterações.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Erro de ligação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Cancelar edição (repõe valores originais) ─────────────────────────
  const handleCancelEdit = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setEditing(false);
    setPasswordSent(false);
    setEmailSent(false);
  };

  // ─── Pedir alteração de email ──────────────────────────────────────────
  const handleRequestEmailChange = async () => {
    if (!newEmail.includes('@')) {
      setEmailError('Introduza um email válido.');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    try {
      const data = await api.requestEmailChange(token, { newEmail });
      if (data.success) {
        setEmailSent(true);
      } else {
        setEmailError(data.message || 'Erro ao enviar email.');
      }
    } catch (e) {
      setEmailError('Erro de ligação. Tente novamente.');
    } finally {
      setEmailLoading(false);
    }
  };

  const openEmailModal = () => {
    setNewEmail('');
    setEmailError('');
    setEmailSent(false);
    setShowEmailModal(true);
  };

  // ─── Pedir alteração de password ───────────────────────────────────────
  const handleRequestPasswordChange = async () => {
    setPasswordLoading(true);
    try {
      const data = await api.requestPasswordChange(token);
      if (data.success) {
        setPasswordSent(true);
      } else {
        Alert.alert('Erro', data.message || 'Erro ao enviar email.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Erro de ligação. Tente novamente.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  if (fetchLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.pageTitle}>Dados Pessoais</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Informação Pessoal ── */}
        <Text style={styles.sectionLabel}>Informação Pessoal</Text>

        <View style={[sharedStyles.card, styles.groupCard]}>
          <FieldRow
            label="Nome"
            value={name}
            onChange={setName}
            placeholder="Nome completo"
            editable={editing}
          />

          <View style={styles.divider} />

          <FieldRow
            label="Telemóvel"
            value={phone}
            onChange={setPhone}
            placeholder="912 345 678"
            keyboardType="phone-pad"
            editable={editing}
          />
        </View>

        {/* ── Conta ── */}
        <Text style={styles.sectionLabel}>Conta</Text>

        <View style={[sharedStyles.card, styles.groupCard]}>
          {/* Email */}
          {!editing ? (
            // Modo leitura: mostra o email atual
            <FieldRow
              label="Email"
              value={email}
              editable={false}
              placeholder="email@exemplo.com"
              keyboardType="email-address"
            />
          ) : emailSent ? (
            // Email de verificação enviado
            <View style={[styles.fieldRow, styles.fieldRowTall]}>
              <View style={styles.sentInfo}>
                <Text style={styles.sentIcon}>✉️</Text>
                <Text style={styles.sentTitle}>Email enviado!</Text>
                <Text style={styles.sentSubtitle}>
                  Confirma a alteração para{'\n'}
                  <Text style={styles.sentHighlight}>{newEmail}</Text>
                </Text>
              </View>
            </View>
          ) : (
            // Modo edição: botão "Alterar" ao lado
            <SensitiveFieldRow
              label="Email"
              currentValue={email}
              onRequestChange={openEmailModal}
              loading={false}
            />
          )}

          <View style={styles.divider} />

          {/* Password */}
          {!editing ? (
            // Modo leitura: mostra pontos
            <FieldRow
              label="Password"
              value=""
              editable={false}
              secureTextEntry
            />
          ) : passwordSent ? (
            // Email de verificação enviado
            <View style={[styles.fieldRow, styles.fieldRowTall]}>
              <View style={styles.sentInfo}>
                <Text style={styles.sentIcon}>✉️</Text>
                <Text style={styles.sentTitle}>Email enviado!</Text>
                <Text style={styles.sentSubtitle}>
                  Verifica a tua caixa de entrada para alterar a password.
                </Text>
              </View>
            </View>
          ) : (
            // Modo edição: botão "Alterar" ao lado
            <SensitiveFieldRow
              label="Password"
              currentValue={null}
              onRequestChange={handleRequestPasswordChange}
              loading={passwordLoading}
            />
          )}
        </View>
      </ScrollView>

      {/* Botões no fundo */}
      <View style={styles.bottomWrap}>
        {!editing ? (
          <TouchableOpacity
            style={sharedStyles.secondaryButton}
            onPress={() => setEditing(true)}
            activeOpacity={0.85}
          >
            <Text style={sharedStyles.secondaryButtonText}>Alterar Dados</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editButtons}>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.cancelBtn]}
              onPress={handleCancelEdit}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, styles.saveBtn]}
              onPress={() => setShowConfirmModal(true)}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={sharedStyles.primaryButtonText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal de confirmação de guardar */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowConfirmModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitle}>
              Tem a certeza que quer{'\n'}guardar as alterações?
            </Text>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, styles.modalBtn]}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Sim, guardar!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
              onPress={() => setShowConfirmModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal de alteração de email */}
      <Modal
        visible={showEmailModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmailModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowEmailModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            {emailSent ? (
              // Estado: email enviado
              <>
                <View style={styles.emailSentIconWrap}>
                  <Text style={styles.emailSentIcon}>✉️</Text>
                </View>
                <Text style={styles.modalTitle}>Email enviado!</Text>
                <Text style={styles.modalSubtitle}>
                  Enviámos um link de confirmação para:{'\n'}
                  <Text style={styles.modalHighlight}>{email}</Text>
                </Text>
                <TouchableOpacity
                  style={[sharedStyles.primaryButton, styles.modalBtn]}
                  onPress={() => setShowEmailModal(false)}
                  activeOpacity={0.85}
                >
                  <Text style={sharedStyles.primaryButtonText}>Fechar</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Estado: input do novo email
              <>
                <Text style={styles.modalTitle}>Alterar email</Text>
                <Text style={styles.modalSubtitle}>
                  Introduza o novo email. Será enviado um link de confirmação para o email atual.
                </Text>

                <TextInput
                  style={[
                    styles.modalInput,
                    emailError ? styles.modalInputError : null,
                  ]}
                  value={newEmail}
                  onChangeText={(t) => { setNewEmail(t); setEmailError(''); }}
                  placeholder="email@exemplo.com"
                  placeholderTextColor={colors.text.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {emailError ? (
                  <Text style={styles.modalFieldError}>{emailError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    sharedStyles.primaryButton,
                    styles.modalBtn,
                    emailLoading && { opacity: 0.7 },
                  ]}
                  onPress={handleRequestEmailChange}
                  disabled={emailLoading}
                  activeOpacity={0.85}
                >
                  {emailLoading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={sharedStyles.primaryButtonText}>Enviar confirmação</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
                  onPress={() => setShowEmailModal(false)}
                  activeOpacity={0.85}
                >
                  <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
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
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: -4,
  },
  groupCard: {
    backgroundColor: colors.white,
    borderWidth: 0,
    padding: 0,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  fieldRowTall: {
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    width: 100,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    textAlign: 'right',
    paddingVertical: 0,
  },
  fieldInputDisabled: {
    color: colors.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  // Campo sensível (email / password em edição)
  sensitiveRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  sensitiveValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'right',
    numberOfLines: 1,
  },
  alterarBtn: {
    backgroundColor: colors.primary + '15',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alterarBtnDisabled: {
    opacity: 0.6,
  },
  alterarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  // Estado "enviado" dentro do card
  sentInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  sentIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  sentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sentSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  sentHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Bottom buttons
  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 1,
  },
  // Modais
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
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -4,
  },
  modalHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: colors.cardBg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.text.primary,
    marginTop: 4,
  },
  modalInputError: {
    borderColor: colors.text.red,
    backgroundColor: colors.redBackground,
  },
  modalFieldError: {
    fontSize: 12,
    color: colors.text.red,
    marginTop: -6,
    marginLeft: 4,
  },
  modalBtn: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingVertical: 15,
  },
  emailSentIconWrap: {
    alignItems: 'center',
  },
  emailSentIcon: {
    fontSize: 40,
  },
});