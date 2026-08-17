import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { colors, sharedStyles } from '../utils/shared-Styles';
import {
  POLICY_SECTIONS,
  POLICY_VERSION,
  POLICY_DATE,
} from '../utils/privacyPolicy';

export default function PrivacyPolicyPage({ navigation }) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <TouchableOpacity
        style={sharedStyles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backArrow}>‹</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Política de Privacidade</Text>
        <Text style={styles.version}>
          Versão {POLICY_VERSION} · {POLICY_DATE}
        </Text>

        {POLICY_SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {index + 1}. {section.title}
            </Text>

            {section.bullets?.map((bullet, i) => (
              <View key={`b${i}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}

            {section.paragraphs?.map((paragraph, i) => (
              <Text key={`p${i}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>
            Pode eliminar a sua conta e todos os dados associados a qualquer
            momento, no ecrã de Perfil.
          </Text>
        </View>
      </ScrollView>
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
    paddingBottom: 40,
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
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  version: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
    marginBottom: 24,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingRight: 4,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
    marginRight: 8,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  footerNote: {
    ...StyleSheet.flatten(sharedStyles.helperBox),
    marginTop: 4,
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    fontWeight: '500',
  },
});