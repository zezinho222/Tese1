import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, sharedStyles } from '../../utils/shared-Styles';
import { api } from '../../api';

export default function RecoverPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const isValid = email.includes('@');

  const handleSend = async () => {
  if (!isValid) return;
  setLoading(true);
  setError('');
  try {
    const data = await api.forgotPassword({ email });

    if (!data.success) {
      setError(data.message || 'Erro ao enviar email.');
      return;
    }

    setSent(true);
  } catch {
    setError('Não foi possível enviar o email. Tente novamente.');
  } finally {
    setLoading(false);
  }
};

  // ── Ecrã de confirmação após envio ──
  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sentContainer}>
          <View style={styles.sentIcon}>
            <Text style={styles.sentIconText}>✉</Text>
          </View>
          <Text style={styles.sentTitle}>Email enviado!</Text>
          <Text style={styles.sentSubtitle}>
            Verifique a sua caixa de entrada em{'\n'}
            <Text style={styles.sentEmail}>{email}</Text>
          </Text>
          <TouchableOpacity
            style={[sharedStyles.primaryButton, { marginTop: 32 }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={sharedStyles.primaryButtonText}>Voltar ao login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resendLink}
            onPress={() => { setSent(false); setEmail(''); }}
          >
            <Text style={styles.resendText}>Não recebi o email</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Ecrã principal ──
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.inner}>
          {/* Back */}
          <TouchableOpacity
            style={sharedStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Recuperar password</Text>
          <Text style={styles.subtitle}>
            Introduza o seu email e enviaremos um link para redefinir a password.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextInput
              style={[
                sharedStyles.input,
              ]}
              placeholder="Email"
              placeholderTextColor={colors.text.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                sharedStyles.primaryButton,
                !isValid && sharedStyles.buttonDisabled,
              ]}
              onPress={handleSend}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={sharedStyles.primaryButtonText}>Continuar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
  },
    backArrow: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 10,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 28,
  },
  errorBox: {
    backgroundColor: colors.redBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: colors.text.red,
    fontSize: 14,
    fontWeight: '500',
  },
  form: {
    gap: 14,
  },
  // Ecrã de confirmação
  sentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sentIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  sentIconText: {
    fontSize: 32,
  },
  sentTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
  },
  sentSubtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  sentEmail: {
    color: colors.primary,
    fontWeight: '600',
  },
  resendLink: {
    marginTop: 16,
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    color: colors.text.secondary,
    textDecorationLine: 'underline',
  },
});