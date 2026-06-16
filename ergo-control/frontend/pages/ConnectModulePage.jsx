import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';

const MODULE_TYPES = [
  {
    id: 'sEMG',
    icon: '⚡',
    title: 'sEMG',
    subtitle: 'Eletromiografia de Superfície',
    accentColor: colors.text.yellow,
    accentBg: colors.yellowBackground,
  },
  {
    id: 'IMU',
    icon: '🧭',
    title: 'IMU',
    subtitle: 'Unidade de Medição Inercial',
    accentColor: colors.primary,
    accentBg: '#DBEAFE',
  },
  {
    id: 'EMS',
    icon: '💪',
    title: 'EMS',
    subtitle: 'Eletroestimulação Muscular',
    accentColor: colors.secondary,
    accentBg: '#D1FAE5',
  },
];

export default function ConnectModulePage({ navigation }) {
  const [selected, setSelected] = useState(null);

  const handleNext = () => {
    if (!selected) return;
    navigation.navigate('ScanModules', { moduleType: selected });
  };

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
        <Text style={styles.pageTitle}>Módulos</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Título da secção */}
        <Text style={styles.sectionHeading}>Conectar Módulos</Text>

        {/* Stepper */}
        <View style={styles.stepper}>
          <View style={styles.stepActive}>
            <Text style={styles.stepNumberActive}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepInactive}>
            <Text style={styles.stepNumberInactive}>2</Text>
          </View>
          <View style={styles.stepLabels}>
            <Text style={styles.stepLabelActive}>Selecionar</Text>
            <Text style={styles.stepLabelInactive}>Procurar</Text>
          </View>
        </View>

        {/* Label */}
        <Text style={styles.sectionLabel}>TIPO DE MÓDULO</Text>

        {/* Opções de módulo */}
        <View style={styles.moduleList}>
          {MODULE_TYPES.map((m) => {
            const isSelected = selected === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  sharedStyles.card,
                  styles.moduleCard,
                  isSelected && { borderColor: m.accentColor, borderWidth: 2 },
                ]}
                onPress={() => setSelected(m.id)}
                activeOpacity={0.82}
              >
                {/* Ícone */}
                <View
                  style={[
                    sharedStyles.iconCircle,
                    styles.iconCircle,
                    { backgroundColor: isSelected ? m.accentBg : colors.cardBg },
                  ]}
                >
                  <Text style={sharedStyles.iconText}>{m.icon}</Text>
                </View>

                {/* Texto */}
                <View style={styles.moduleText}>
                  <Text
                    style={[
                      styles.moduleTitle,
                      isSelected && { color: m.accentColor },
                    ]}
                  >
                    {m.title}
                  </Text>
                  <Text style={styles.moduleSubtitle}>{m.subtitle}</Text>
                </View>

                {/* Checkbox */}
                <View
                  style={[
                    sharedStyles.checkboxCircle,
                    isSelected && { borderColor: m.accentColor },
                  ]}
                >
                  {isSelected && (
                    <View
                      style={[
                        sharedStyles.checkboxDot,
                        { backgroundColor: m.accentColor },
                      ]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Botão Seguinte */}
      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={[
            sharedStyles.primaryButton,
            !selected && sharedStyles.buttonDisabled,
          ]}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={!selected}
        >
          <Text
            style={[
              sharedStyles.primaryButtonText,
              !selected && { color: colors.text.secondary },
            ]}
          >
            Seguinte
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Header ── */
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

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  /* ── Título secção ── */
  sectionHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 8,
    marginBottom: 24,
    letterSpacing: -0.5,
  },

  /* ── Stepper ── */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  stepActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberActive: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 8,
    maxWidth: 40,
  },
  stepInactive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.disabled,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberInactive: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  stepLabels: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 48,
    paddingLeft: 4,
  },
  stepLabelActive: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  stepLabelInactive: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    marginLeft: 4,
  },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 28,
  },

  /* ── Module cards ── */
  moduleList: {
    gap: 12,
  },
  moduleCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingRight: 16,
    borderWidth: 1,
  },
  iconCircle: {
    marginLeft: 12,
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moduleText: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  moduleSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },

  /* ── Bottom ── */
  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});