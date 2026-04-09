import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { colors, sharedStyles } from '../../utils/shared-Styles';

export default function WelcomePage({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>

        {/* Logo / título */}
        <View style={styles.heroSection}>
          <Text style={styles.title}>ErgoControl</Text>
          <Text style={styles.subtitle}>
            Controlo inteligente de dispositivos vestíveis
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          {[
            'Calibração e controlo personalizado',
            'Conexão com dispositivos vestíveis',
            'Monitorização em tempo real',
          ].map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureArrow}>→</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Botões */}
        <View style={styles.buttonsSection}>
          <TouchableOpacity
            style={sharedStyles.primaryButton}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Text style={sharedStyles.primaryButtonText}>Começar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Text style={styles.loginLinkText}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>

      </View>
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
    paddingHorizontal: 32,
    justifyContent: 'center',
    gap: 40,
  },
  heroSection: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresSection: {
    gap: 14,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureArrow: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  featureText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  buttonsSection: {
    gap: 16,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
});