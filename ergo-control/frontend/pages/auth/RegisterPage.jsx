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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, sharedStyles } from '../../utils/shared-Styles';

export default function RegisterPage({ navigation }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Nome obrigatório';
    if (!form.email.includes('@')) e.email = 'Email inválido';
    if (form.password.length < 8) e.password = 'Mínimo 8 caracteres';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords não coincidem';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const isValid =
    form.name.length > 0 &&
    form.email.length > 0 &&
    form.password.length >= 8 &&
    form.password === form.confirmPassword;

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      // TODO: chamar useAuth().register(form)
      await new Promise(r => setTimeout(r, 1000));
      // navigation.replace('MainTabs');
    } catch (e) {
      setErrors({ general: 'Erro ao criar conta. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ field, placeholder, secure, keyboard, optional }) => (
    <View style={styles.fieldWrap}>
      <TextInput
        style={[
          sharedStyles.input,
          form[field].length > 0 && sharedStyles.inputSelected,
          errors[field] && styles.inputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        value={form[field]}
        onChangeText={set(field)}
        secureTextEntry={!!secure}
        keyboardType={keyboard || 'default'}
        autoCapitalize={secure || keyboard === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
      />
      {errors[field] ? (
        <Text style={styles.fieldError}>{errors[field]}</Text>
      ) : null}
    </View>
  );

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
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Registo</Text>

          {errors.general ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Field field="name" placeholder="Nome completo" />
            <Field field="email" placeholder="Email" keyboard="email-address" />
            <Field field="phone" placeholder="Telemóvel (Opcional)" keyboard="phone-pad" />
            <Field field="password" placeholder="Password (mínimo 8 caracteres)" secure />
            <Field field="confirmPassword" placeholder="Confirmar Password" secure />

            <TouchableOpacity
              style={[
                sharedStyles.primaryButton,
                !isValid && sharedStyles.buttonDisabled,
              ]}
              onPress={handleRegister}
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
    fontSize: 22,
    color: colors.text.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
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
  fieldWrap: {
    gap: 4,
  },
  inputError: {
    borderColor: colors.text.red,
    backgroundColor: colors.redBackground,
  },
  fieldError: {
    fontSize: 12,
    color: colors.text.red,
    marginLeft: 4,
  },
});