import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Switch,
  Modal,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';

const moduleOptions = [
  { id: 'semg', title: 'sEMG', subtitle: 'Atividade Muscular' },
  { id: 'imu', title: 'IMU', subtitle: 'Dados de movimento' },
];

export default function MonitoringPage({ navigation }) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [emsActive, setEmsActive] = useState(false);
  const [intensity, setIntensity] = useState(5);
  const [frequency, setFrequency] = useState(50);

  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);

  const [selectedModules, setSelectedModules] = useState({ semg: false, imu: false });
  const [noModuleError, setNoModuleError] = useState(false);

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  const toggleModule = (id) => {
    setSelectedModules(prev => ({ ...prev, [id]: !prev[id] }));
    setNoModuleError(false);
  };

  const handleStartPress = () => {
    if (isMonitoring) {
      setShowStopModal(true);
    } else {
      setSelectedModules({ semg: false, imu: false });
      setNoModuleError(false);
      setShowModuleModal(true);
    }
  };

  const handleSeguinte = () => {
    const nenhumSelecionado = !selectedModules.semg && !selectedModules.imu;
    if (nenhumSelecionado) {
      setNoModuleError(true);
      return;
    }

    const precisaCalibrar = selectedModules.imu;
    setShowModuleModal(false);
    setNoModuleError(false);

    if (precisaCalibrar) {
      setShowErrorModal(true);
    } else {
      setIsMonitoring(true);
    }
  };

  const handleConfirmStop = () => {
    setIsMonitoring(false);
    setShowStopModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Monitorizar</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Dados em tempo real</Text>
        <View style={[styles.statusBadge, isMonitoring ? styles.statusBadgeActive : styles.statusBadgeIdle]}>
          <View style={[styles.statusDot, isMonitoring ? styles.statusDotActive : styles.statusDotIdle]} />
          <Text style={[styles.statusBadgeText, isMonitoring ? styles.statusBadgeTextActive : styles.statusBadgeTextIdle]}>
            {isMonitoring ? 'A monitorizar' : 'À espera de início'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>sEMG - Atividade Muscular</Text>
          <View style={styles.graphArea}>
            {isMonitoring ? (
              <View style={styles.graphLinesWrap}>
                {[...Array(3)].map((_, i) => (
                  <View key={i} style={[styles.graphLine, { opacity: 0.4 + i * 0.25, marginTop: i * 6 }]} />
                ))}
              </View>
            ) : (
              <Text style={styles.noDataText}>Sem dados - Inicie a monitorização</Text>
            )}
          </View>
        </View>

        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>IMU - Dados de movimento</Text>
          <View style={styles.graphArea}>
            {isMonitoring ? (
              <View style={styles.graphLinesWrap}>
                {[...Array(3)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.graphLine,
                      { opacity: 0.3 + i * 0.3, marginTop: i * 6, backgroundColor: colors.secondary },
                    ]}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.noDataText}>Sem dados - Inicie a monitorização</Text>
            )}
          </View>
        </View>

        <View style={[sharedStyles.card, styles.sectionCard, styles.emsSectionCard]}>
          <Text style={styles.sectionTitle}>EMS - Estimulação</Text>

          {!isMonitoring && (
            <>
              <Text style={styles.emsSubtitle}>Ajuste os parâmetros antes de iniciar</Text>

              <View style={styles.emsRow}>
                <Text style={styles.emsLabel}>Intensidade</Text>
                <Text style={styles.emsUnit}>mA</Text>
                <View style={styles.counterWrap}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setIntensity((v) => clamp(v - 1, 0, 100))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.counterBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{intensity}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setIntensity((v) => clamp(v + 1, 0, 100))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.emsRow}>
                <Text style={styles.emsLabel}>Frequência</Text>
                <Text style={styles.emsUnit}>Hz</Text>
                <View style={styles.counterWrap}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setFrequency((v) => clamp(v - 1, 1, 200))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.counterBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{frequency}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setFrequency((v) => clamp(v + 1, 1, 200))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.emsToggleRow}>
                <Text style={styles.emsLabel}>Activar EMS</Text>
                <Switch
                  value={emsActive}
                  onValueChange={setEmsActive}
                  trackColor={{ false: colors.border, true: colors.primary + '80' }}
                  thumbColor={emsActive ? colors.primary : colors.disabled}
                />
              </View>
            </>
          )}

          {isMonitoring && emsActive && (
            <View style={styles.emsSummary}>
              <View style={styles.emsSummaryItem}>
                <Text style={styles.emsSummaryValue}>{intensity} mA</Text>
                <Text style={styles.emsSummaryLabel}>Intensidade</Text>
              </View>
              <View style={styles.emsSummaryDivider} />
              <View style={styles.emsSummaryItem}>
                <Text style={styles.emsSummaryValue}>{frequency} Hz</Text>
                <Text style={styles.emsSummaryLabel}>Frequência</Text>
              </View>
            </View>
          )}

          {isMonitoring && !emsActive && (
            <View style={[sharedStyles.helperBox]}>
              <Text style={sharedStyles.helperText}>EMS desativado</Text>
            </View>
          )}
        </View>

      </ScrollView>

      <View style={styles.startBtnWrap}>
        <TouchableOpacity
          style={[sharedStyles.primaryButton, styles.startBtn, isMonitoring && styles.stopBtn]}
          onPress={handleStartPress}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnIcon}>{isMonitoring ? '■' : '▶'}</Text>
          <Text style={sharedStyles.primaryButtonText}>
            {isMonitoring ? 'Parar Monitorização' : 'Iniciar Monitorização'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showModuleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModuleModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowModuleModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <Text style={styles.modalTitle}>
              Selecione os módulos em que{'\n'}pretende iniciar a monitorização
            </Text>

            <View style={styles.moduleList}>
              {moduleOptions.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    sharedStyles.input,
                    styles.moduleItem,
                    selectedModules[m.id] && sharedStyles.inputSelected,
                  ]}
                  onPress={() => toggleModule(m.id)}
                  activeOpacity={0.82}
                >
                  <View style={styles.moduleItemText}>
                    <Text style={[
                      styles.moduleTitle,
                      selectedModules[m.id] && sharedStyles.inputSelectedText,
                    ]}>
                      {m.title}
                    </Text>
                    <Text style={styles.moduleSubtitle}>{m.subtitle}</Text>
                  </View>
                  <View style={[
                    sharedStyles.checkboxCircle,
                    selectedModules[m.id] && sharedStyles.checkboxSelected,
                  ]}>
                    {selectedModules[m.id] && <View style={sharedStyles.checkboxDot} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, styles.modalBtn]}
              onPress={handleSeguinte}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Seguinte</Text>
            </TouchableOpacity>

            {noModuleError && (
              <View style={[sharedStyles.helperBox, styles.errorBox]}>
                <Text style={[sharedStyles.helperText, styles.errorText]}>
                  Tem de selecionar pelo menos um módulo!
                </Text>
              </View>
            )}

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowErrorModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <View style={styles.errorIconWrap}>
              <View style={[sharedStyles.closeButton, styles.errorIcon]}>
                <Text style={sharedStyles.closeButtonText}>✕</Text>
              </View>
            </View>

            <Text style={styles.modalTitleBold}>Erro!</Text>
            <Text style={styles.modalSubtitle}>
              Antes de iniciar a monitorização{'\n'}tem de calibrar os módulos!
            </Text>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, styles.modalBtn]}
              onPress={() => {
                setShowErrorModal(false);
                navigation.navigate('Calibrate');
              }}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Calibrar</Text>
            </TouchableOpacity>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showStopModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStopModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowStopModal(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>

            <Text style={styles.modalTitle}>
              Tem a certeza que quer parar{'\n'}a monitorização?
            </Text>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton, styles.modalBtn]}
              onPress={handleConfirmStop}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.confirmButtonText}>Sim, tenho!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton, styles.modalBtn]}
              onPress={() => setShowStopModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Não, cancelar!</Text>
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

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statusLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusBadgeIdle: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeActive: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotIdle: {
    backgroundColor: colors.text.secondary,
  },
  statusDotActive: {
    backgroundColor: colors.secondary,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextIdle: {
    color: colors.text.secondary,
  },
  statusBadgeTextActive: {
    color: colors.secondary,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },

  sectionCard: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },

  graphArea: {
    height: 70,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  noDataText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  graphLinesWrap: {
    width: '100%',
    gap: 4,
    paddingTop: 12,
  },
  graphLine: {
    height: 2,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  emsSectionCard: {
    gap: 4,
  },
  emsSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 10,
    marginTop: -8,
  },
  emsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  emsLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emsUnit: {
    fontSize: 13,
    color: colors.text.secondary,
    marginRight: 10,
    width: 24,
    textAlign: 'right',
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counterBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    minWidth: 28,
    textAlign: 'center',
  },

  emsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
    marginTop: 4,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emsSummaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  emsSummaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  emsSummaryLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  emsSummaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },

  startBtnWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startBtn: {
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    backgroundColor: colors.text.red,
    shadowColor: colors.text.red,
  },
  startBtnIcon: {
    fontSize: 16,
    color: colors.white,
    position: 'absolute',
    left: 20,
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 4,
  },
  modalTitleBold: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalBtn: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingVertical: 15,
  },

  moduleList: {
    gap: 8,
  },
  moduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  moduleItemText: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  moduleSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },

  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },

  errorIconWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});