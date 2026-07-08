import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import moduleService from '../moduleService';
import syncService from '../syncService';


const STORAGE_KEY = '@ergocontrol/connected_module';
const MODULE_IP   = '192.168.4.1';

// ── Opções de offset ───────────────────────────────────────────────────────────
const OFFSET_OPTIONS = [
  { label: '0.9 V', value: 0 },
  { label: '1.9 V', value: 2500 },
  { label: '2.6 V', value: 3605 },
];

// ── Fórmula de frequência ─────────────────────────────────────────────────────
const calcFreqValue = (hz) => Math.round((280e6) / (27 * hz));

// ── Sensores selecionáveis ────────────────────────────────────────────────────
const SENSORS = [
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
    accentBg: colors.infoBorder,
  },
];

// ── Modal de step ─────────────────────────────────────────────────────────────
// step: 0 = seleção | 1 = POT | 2 = FREQ | 3 = a gravar
const STEP_SELECTION = 0;
const STEP_POT       = 1;
const STEP_FREQ      = 2;
const STEP_SAVING    = 3;

export default function ConnectModulePage({ navigation }) {
  const { token } = useAuth();

  // Sensores selecionados
  const [semgOn, setSemgOn] = useState(false);
  const [imuOn,  setImuOn]  = useState(false);

  // Modal POT
  const [modalStep,       setModalStep]       = useState(STEP_SELECTION);
  const [selectedOffset,  setSelectedOffset]  = useState(null); // { label, value }

  // Modal FREQ
  const [freqHz,          setFreqHz]          = useState(2000);

  const [error,           setError]           = useState('');
  const [saving,          setSaving]          = useState(false);
  const [leaving,         setLeaving]         = useState(false);

  // ── Lógica de seleção ─────────────────────────────────────────────────────
  const atLeastOne = semgOn || imuOn;

  const getSensorString = () => {
    if (semgOn && imuOn)  return 'DUAL';
    if (semgOn)           return 'EMG';
    return 'IMU';
  };

  // ── Confirmar seleção → abre modal POT ───────────────────────────────────
  const handleSeguinte = () => {
    if (!atLeastOne) {
      setError('Seleciona pelo menos um sensor.');
      return;
    }
    setError('');
    setSelectedOffset(null);
    setModalStep(STEP_POT);
  };

  // ── Confirmar POT → abre modal FREQ ──────────────────────────────────────
  const handleConfirmPot = () => {
    if (!selectedOffset) {
      setError('Seleciona um valor de offset.');
      return;
    }
    setError('');
    // Envia comando POT + valor ao módulo
    moduleService.sendCommand('POT');
    moduleService.sendCommand(String(selectedOffset.value));
    setModalStep(STEP_FREQ);
  };

  // ── Confirmar FREQ → guarda tudo ─────────────────────────────────────────
  const handleConfirmFreq = async () => {
    setError('');
    setSaving(true);
    setModalStep(STEP_SAVING);

    const freqValue    = calcFreqValue(freqHz);
    const sensorString = getSensorString();

    // Envia comando FREQ + valor ao módulo
    moduleService.sendCommand('FREQ');
    moduleService.sendCommand(String(freqValue));

    // Monta o objecto do módulo
    const moduleData = {
      name:            'ErgoControl',
      ip:              MODULE_IP,
      port:            80,
      battery:         null,
      sensorSelection: sensorString,
      offsetValue:     selectedOffset.value,
      offsetLabel:     selectedOffset.label,
      freqHz,
      freqValue,
      calibrated:      { sEMG: false, IMU: imuOn },
      mvc:             null,
    };

    // Guarda sempre localmente primeiro (offline-first) — não depende de internet
    await syncService.queueModuleSave(moduleData);

    // Tenta sincronizar já com o backend; se não houver internet, fica para o
    // listener automático em App.js sincronizar assim que a houver.
    syncService.trySyncAll(token);

    setSaving(false);
    setModalStep(STEP_SELECTION);

    navigation.navigate('MainTabs', {
      screen: 'Módulos',
      params: { refresh: Date.now() },
    });
  };

  const handleCancelModal = () => {
    setError('');
    setModalStep(STEP_SELECTION);
  };

  // ── Voltar atrás: sai do fluxo sem guardar → desliga o WebSocket
  //    e liberta a Wi-Fi forçada, para o resto da app voltar a usar internet ──
  const handleBack = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await moduleService.disconnect();
    } catch (e) {
      console.log('[ConnectModulePage] Erro ao desligar módulo:', e);
    } finally {
      setLeaving(false);
      navigation.goBack();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={handleBack}
          disabled={leaving}
        >
          {leaving
            ? <ActivityIndicator size="small" color={colors.text.primary} />
            : <Text style={styles.backArrow}>‹</Text>
          }
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Módulos</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>Conectar Módulos</Text>

        {/* ── Stepper: Passo 2 ativo ── */}
        <View style={styles.stepper}>
          <View style={styles.stepDone}>
            <Text style={styles.stepDoneNumber}>✓</Text>
          </View>
          <View style={[styles.stepLine, { backgroundColor: colors.primary }]} />
          <View style={styles.stepActive}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <View style={styles.stepLabels}>
            <Text style={styles.stepLabelDone}>Procurar</Text>
            <Text style={styles.stepLabelActive}>Selecionar</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SENSORES</Text>

        {/* ── Lista de sensores (multi-select) ── */}
        <View style={styles.sensorList}>
          {SENSORS.map((s) => {
            const isOn     = s.id === 'sEMG' ? semgOn : imuOn;
            const toggle   = () => {
              setError('');
              if (s.id === 'sEMG') setSemgOn((v) => !v);
              else                 setImuOn((v) => !v);
            };
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  sharedStyles.card,
                  styles.sensorCard,
                  isOn && { borderColor: s.accentColor, borderWidth: 2 },
                ]}
                onPress={toggle}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    sharedStyles.iconCircle,
                    styles.iconCircle,
                    { backgroundColor: isOn ? s.accentBg : colors.cardBg },
                  ]}
                >
                  <Text style={sharedStyles.iconText}>{s.icon}</Text>
                </View>
                <View style={styles.sensorText}>
                  <Text style={[styles.sensorTitle, isOn && { color: s.accentColor }]}>
                    {s.title}
                  </Text>
                  <Text style={styles.sensorSubtitle}>{s.subtitle}</Text>
                </View>
                <View
                  style={[
                    sharedStyles.checkboxCircle,
                    isOn && { borderColor: s.accentColor },
                  ]}
                >
                  {isOn && (
                    <View
                      style={[sharedStyles.checkboxDot, { backgroundColor: s.accentColor }]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Resumo seleção */}
        {atLeastOne && (
          <View style={sharedStyles.helperBox}>
            <Text style={[sharedStyles.helperText, { textAlign: 'center', fontStyle: 'normal' }]}>
              Modo selecionado:{' '}
              <Text style={{ fontWeight: '700', color: colors.text.primary }}>
                {getSensorString()}
              </Text>
            </Text>
          </View>
        )}

        {error !== '' && (
          <View style={[sharedStyles.helperBox, styles.errorBox]}>
            <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Botão Seguinte ── */}
      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={[
            sharedStyles.primaryButton,
            !atLeastOne && sharedStyles.buttonDisabled,
          ]}
          onPress={handleSeguinte}
          activeOpacity={0.85}
          disabled={!atLeastOne}
        >
          <Text
            style={[
              sharedStyles.primaryButtonText,
              !atLeastOne && { color: colors.text.secondary },
            ]}
          >
            Seguinte
          </Text>
        </TouchableOpacity>
      </View>

      {/* ═══════════════════════════════════════
          Modal POT — Escolha de Offset
      ═══════════════════════════════════════ */}
      <Modal
        visible={modalStep === STEP_POT}
        transparent
        animationType="fade"
        onRequestClose={handleCancelModal}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>🔧</Text>
            </View>
            <Text style={styles.modalTitle}>Configuração de Offset</Text>
            <Text style={styles.modalSubtitle}>
              Escolhe o valor de tensão de referência (offset) para o sEMG.
            </Text>

            <View style={styles.optionList}>
              {OFFSET_OPTIONS.map((opt) => {
                const isSelected = selectedOffset?.value === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      sharedStyles.input,
                      styles.optionItem,
                      isSelected && sharedStyles.inputSelected,
                    ]}
                    onPress={() => { setSelectedOffset(opt); setError(''); }}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        sharedStyles.inputText,
                        styles.optionLabel,
                        isSelected && sharedStyles.inputSelectedText,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <View
                      style={[
                        sharedStyles.checkboxCircle,
                        isSelected && sharedStyles.checkboxSelected,
                      ]}
                    >
                      {isSelected && <View style={sharedStyles.checkboxDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error !== '' && (
              <View style={[sharedStyles.helperBox, styles.errorBox]}>
                <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={sharedStyles.primaryButton}
              onPress={handleConfirmPot}
              activeOpacity={0.85}
            >
              <Text style={[sharedStyles.primaryButtonText, { fontSize: 16 }]}>Confirmar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={handleCancelModal}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal FREQ — Escolha de Frequência
      ═══════════════════════════════════════ */}
      <Modal
        visible={modalStep === STEP_FREQ}
        transparent
        animationType="fade"
        onRequestClose={handleCancelModal}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>📶</Text>
            </View>
            <Text style={styles.modalTitle}>Frequência de Amostragem</Text>
            <Text style={styles.modalSubtitle}>
              Escolhe a frequência de aquisição do sinal (entre 1000 Hz e 4000 Hz).
            </Text>

            {/* Valor atual */}
            <View style={styles.freqValueWrap}>
              <Text style={styles.freqValue}>{freqHz}</Text>
              <Text style={styles.freqUnit}>Hz</Text>
            </View>

            {/* Slider */}
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={1000}
              maximumValue={4000}
              step={100}
              value={freqHz}
              onValueChange={(v) => setFreqHz(Math.round(v))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />

            <View style={styles.freqRange}>
              <Text style={styles.freqRangeText}>1000 Hz</Text>
              <Text style={styles.freqRangeText}>4000 Hz</Text>
            </View>

            {/* Valor calculado */}
            <View style={sharedStyles.helperBox}>
              <Text style={[sharedStyles.helperText, { textAlign: 'center', fontStyle: 'normal' }]}>
                Valor enviado ao módulo:{' '}
                <Text style={{ fontWeight: '700', color: colors.text.primary }}>
                  {calcFreqValue(freqHz)}
                </Text>
              </Text>
            </View>

            <TouchableOpacity
              style={sharedStyles.primaryButton}
              onPress={handleConfirmFreq}
              activeOpacity={0.85}
            >
              <Text style={[sharedStyles.primaryButtonText, { fontSize: 16 }]}>Confirmar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={handleCancelModal}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: A gravar
      ═══════════════════════════════════════ */}
      <Modal visible={modalStep === STEP_SAVING} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { paddingVertical: 40, alignItems: 'center', gap: 16 }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.modalTitle}>A guardar configuração...</Text>
          </View>
        </View>
      </Modal>
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
  },
  headerSpacer: {
    width: 50,
  },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },

  /* ── Títulos de secção ── */
  sectionHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 8,
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  /* ── Stepper ── */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
    position: 'relative',
  },
  stepDone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDoneNumber: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    maxWidth: 40,
  },
  stepActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  stepLabels: {
    position: 'absolute',
    bottom: -22,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 48,
    paddingLeft: 4,
  },
  stepLabelDone: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  stepLabelActive: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 8,
  },

  /* ── Sensores ── */
  sensorList: {
    gap: 12,
  },
  sensorCard: {
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
  sensorText: {
    flex: 1,
  },
  sensorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sensorSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },

  /* ── Erro ── */
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },

  /* ── Rodapé ── */
  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  /* ── Modais — estrutura base ── */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
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
  modalIconWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  modalIcon: {
    fontSize: 38,
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
    lineHeight: 21,
  },

  /* ── Modal POT — Opções de offset ── */
  optionList: {
    gap: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
  },

  /* ── Modal FREQ — Frequência ── */
  freqValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 4,
  },
  freqValue: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  freqUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  freqRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  freqRangeText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
  },
});