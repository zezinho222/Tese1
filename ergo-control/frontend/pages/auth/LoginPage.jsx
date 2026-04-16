import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, sharedStyles } from '../../utils/shared-Styles';
import { api } from '../../api';

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = email.length > 0 && password.length > 0;

  const handleLogin = async () => {
  if (!isValid) return;
  setLoading(true);
  setError('');
  try {
    const data = await api.login({ email, password });

    if (!data.success) {
      setError(data.message || 'Email ou password incorretos.');
      return;
    }

    navigation.replace('MainTabs');
  } catch (e) {
    setError('Erro de ligação. Tente novamente.');
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity
            style={sharedStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>ER</Text>
            </View>
            <Text style={styles.logoLabel}>BiRDLAB</Text>
          </View>

          {/* Título */}
          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>Entre na sua conta</Text>

          {/* Erro */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Inputs */}
          <View style={styles.form}>
            <TextInput
              style={[
                sharedStyles.input,
              ]}
              placeholder="Email / Telemóvel"
              placeholderTextColor={colors.text.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={[
                sharedStyles.input,
              ]}
              placeholder="Password"
              placeholderTextColor={colors.text.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {/* Entrar */}
            <TouchableOpacity
              style={[
                sharedStyles.primaryButton,
              ]}
              onPress={handleLogin}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={sharedStyles.primaryButtonText}>Entrar</Text>
              )}
            </TouchableOpacity>

            {/* Recuperar password */}
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => navigation.navigate('Recover')}
            >
              <Text style={styles.forgotText}>Esqueceu-se da password?</Text>
            </TouchableOpacity>
          </View>

          {/* Criar conta */}
          <View style={styles.footer}>
            <Text style={styles.footerLabel}>Não tem conta?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Criar conta</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
    backArrow: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 36,
  },
  
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 28,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  logoLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 4,
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
    textAlign: 'center',
  },
  form: {
    gap: 14,
  },
  forgotLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 32,
  },
  footerLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  footerLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});