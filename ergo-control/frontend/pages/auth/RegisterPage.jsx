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


const Field = ({ field, placeholder, secure, keyboard, form, setForm, errors }) => {
  const set = (value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <View style={styles.fieldWrap}>
      <TextInput
        style={[
          sharedStyles.input,
          errors[field] && styles.inputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        value={form[field]}
        onChangeText={set}
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
};

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
    form.name.trim().length > 0 &&
    form.email.includes('@') &&
    form.password.length >= 8 &&
    form.password === form.confirmPassword;

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      setErrors({ general: 'Erro ao criar conta. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const fieldProps = { form, setForm, errors };

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
          {/* ✅ Seta mais grossa usando Text com peso bold */}
          <TouchableOpacity
            style={sharedStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Registo</Text>

          {errors.general ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Field field="name" placeholder="Nome completo" {...fieldProps} />
            <Field field="email" placeholder="Email" keyboard="email-address" {...fieldProps} />
            <Field field="phone" placeholder="Telemóvel (Opcional)" keyboard="phone-pad" {...fieldProps} />
            <Field field="password" placeholder="Password (mínimo 8 caracteres)" secure {...fieldProps} />
            <Field field="confirmPassword" placeholder="Confirmar Password" secure {...fieldProps} />

            {/* ✅ Botão azul quando válido, cinzento quando não */}
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
                <Text style={[
                  sharedStyles.primaryButtonText,
                  !isValid && styles.buttonTextDisabled,
                ]}>
                  Continuar
                </Text>
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
    fontSize: 36,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 36,
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
  buttonTextDisabled: {
    color: colors.text.secondary,
  },
});