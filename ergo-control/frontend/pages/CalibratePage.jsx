import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Animated,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import moduleService from '../moduleService';
import { calculateMVC } from '../utils/emgProcessing';

const STORAGE_KEY = '@ergocontrol/connected_module';

// ── Metadados por tipo de sensor (mesmo padrão de ModulesPage/ConnectModulePage) ──
const TYPE_META = {
  sEMG: { icon: '⚡', subtitle: 'Eletromiografia de Superfície', color: colors.text.yellow, bg: colors.yellowBackground },
  IMU:  { icon: '🧭', subtitle: 'Unidade de Medição Inercial',   color: colors.primary,      bg: colors.infoBorder },
};

// ── Passos do fluxo de calibração sEMG ───────────────────────────────────────
// 'idle' → 'prepare' (3s) → 'acquiring' (5s) → 'stopping' (3s) → 'done' | 'error'
const CAL_IDLE      = 'idle';
const CAL_PREPARE   = 'prepare';   // "Comece o MVC" — espera 3s para o utilizador se preparar
const CAL_ACQUIRING = 'acquiring'; // 5 segundos de aquisição
const CAL_STOPPING  = 'stopping';  // "Pare o MVC" — espera 3s antes de enviar IDLE
const CAL_DONE      = 'done';
const CAL_ERROR     = 'error';

export default function CalibratePage({ navigation }) {
  const { token } = useAuth();

  const [localModule,   setLocalModule]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState('');

  // Estado da calibração sEMG
  const [calStep,       setCalStep]       = useState(CAL_IDLE);
  const [countdown,     setCountdown]     = useState(0);  // segundos restantes
  const [calError,      setCalError]      = useState('');
  const [saving,        setSaving]        = useState(false);

  const timerRef    = useRef(null);
  const dotAnim     = useRef(new Animated.Value(1)).current;
  const dotAnimRef  = useRef(null);

  // ── Carregar módulo do AsyncStorage ──────────────────────────────────────
  const loadModule = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const mod = JSON.parse(raw);
        setLocalModule(mod);
        // IMU é auto-calibrado quando conectado
        if ((mod.sensorSelection === 'IMU' || mod.sensorSelection === 'DUAL') && !mod.calibrated?.IMU) {
          const updated = { ...mod, calibrated: { ...mod.calibrated, IMU: true } };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          setLocalModule(updated);
        }
      } else {
        setLocalModule(null);
      }
    } catch {
      setError('Erro ao carregar módulo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarrega sempre que a página ganha foco (ex: ao voltar de ModulesPage)
  useFocusEffect(useCallback(() => { loadModule(); }, []));

  // ── Cleanup de timers ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      dotAnimRef.current?.stop();
    };
  }, []);

  // ── Animação do ponto pulsante (durante aquisição) ────────────────────────
  const startDotAnim = () => {
    dotAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ])
    );
    dotAnimRef.current.start();
  };

  const stopDotAnim = () => {
    dotAnimRef.current?.stop();
    dotAnim.setValue(1);
  };

  // ── Contagem decrescente genérica ─────────────────────────────────────────
  const startCountdown = (seconds, onFinish) => {
    setCountdown(seconds);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          onFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ══════════════════════════════════════════════════════════
  //  FLUXO DE CALIBRAÇÃO sEMG
  // ══════════════════════════════════════════════════════════

  const handleCalibrateEMG = () => {
    setCalError('');
    // 1. Envia EMG ao módulo
    const sent = moduleService.sendCommand('EMG');
    if (!sent) {
      setCalError('Módulo não está ligado. Reconecta antes de calibrar.');
      return;
    }
    // 2. Mostra "Comece o MVC" — espera 3s para o utilizador se preparar
    setCalStep(CAL_PREPARE);
    startCountdown(3, () => {
      // 3. Após 3s → inicia aquisição (5s)
      moduleService.startCalibration();
      setCalStep(CAL_ACQUIRING);
      startDotAnim();
      startCountdown(5, () => {
        // 4. Após 5s → mostra "Pare o MVC", espera 3s
        stopDotAnim();
        setCalStep(CAL_STOPPING);
        startCountdown(3, () => {
          // 5. Após 3s → envia IDLE e calcula MVC
          moduleService.sendCommand('IDLE');
          const buffer = moduleService.stopCalibration();
          handleSaveMVC(buffer);
        });
      });
    });
  };

  const handleSaveMVC = async (buffer) => {
    setSaving(true);
    setCalStep(CAL_IDLE); // fecha o modal de progresso enquanto guarda

    let mvc = null;
    try {
      const result = calculateMVC(buffer);
      mvc = result.mvc;
    } catch {
      mvc = null;
    }

    // Atualiza AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const mod     = JSON.parse(raw);
        const updated = {
          ...mod,
          mvc,
          calibrated: { ...mod.calibrated, sEMG: true },
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setLocalModule(updated);

        // Guarda no backend
        if (token && mod.backendId) {
          await api.updateCalibration(token, mod.backendId, { sensor: 'sEMG', mvc }).catch(() => {});
        }
      }
    } catch {
      // Sem internet — continua offline
    }

    setSaving(false);
    setCalStep(CAL_DONE);
  };

  const resetCalibration = () => {
    clearInterval(timerRef.current);
    stopDotAnim();
    moduleService.stopCalibration();
    moduleService.sendCommand('IDLE');
    setCalStep(CAL_IDLE);
    setCalError('');
    setCountdown(0);
  };

  // ── Sensores a mostrar com base na seleção ────────────────────────────────
  const showEMG = localModule?.sensorSelection === 'EMG' || localModule?.sensorSelection === 'DUAL';
  const showIMU = localModule?.sensorSelection === 'IMU' || localModule?.sensorSelection === 'DUAL';

  const emgCalibrated = localModule?.calibrated?.sEMG ?? false;
  const imuCalibrated = localModule?.calibrated?.IMU  ?? false;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Calibrar</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadModule(true)}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={styles.sectionTitle}>Sensores</Text>

          {error !== '' && (
            <View style={[sharedStyles.helperBox, styles.errorBox]}>
              <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
            </View>
          )}

          {!localModule ? (
            <View style={[sharedStyles.card, styles.emptyCard]}>
              <Text style={styles.emptyIcon}>🔌</Text>
              <Text style={styles.emptyTitle}>Sem módulo ligado</Text>
              <Text style={styles.emptySubtitle}>
                Conecta um módulo na página "Módulos" para o poder calibrar aqui.
              </Text>
            </View>
          ) : (
            <View style={styles.sensorGroup}>

              {/* ── sEMG ── */}
              {showEMG && (
                <View style={[sharedStyles.card, styles.sensorCard]}>
                  <View style={[sharedStyles.iconCircle, styles.iconCircle, { backgroundColor: TYPE_META.sEMG.bg }]}>
                    <Text style={sharedStyles.iconText}>{TYPE_META.sEMG.icon}</Text>
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>sEMG</Text>
                    <Text style={styles.cardSubtitle}>{TYPE_META.sEMG.subtitle}</Text>
                    {emgCalibrated && localModule.mvc != null && (
                      <Text style={styles.mvcText}>MVC: {localModule.mvc.toFixed(4)}</Text>
                    )}
                  </View>
                  {emgCalibrated ? (
                    <View>
                      <View style={styles.okBadge}>
                        <Text style={styles.okBadgeText}>OK</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.recalibrateBtn}
                        onPress={handleCalibrateEMG}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.recalibrateBtnText}>Repetir</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.calibrateBtn}
                      onPress={handleCalibrateEMG}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.calibrateBtnText}>Calibrar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ── IMU ── */}
              {showIMU && (
                <View style={[sharedStyles.card, styles.sensorCard]}>
                  <View style={[sharedStyles.iconCircle, styles.iconCircle, { backgroundColor: TYPE_META.IMU.bg }]}>
                    <Text style={sharedStyles.iconText}>{TYPE_META.IMU.icon}</Text>
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>IMU</Text>
                    <Text style={styles.cardSubtitle}>{TYPE_META.IMU.subtitle}</Text>
                    <Text style={styles.autoText}>Calibração automática ao ligar</Text>
                  </View>
                  <View style={styles.okBadge}>
                    <Text style={styles.okBadgeText}>OK</Text>
                  </View>
                </View>
              )}

              {calError !== '' && (
                <View style={[sharedStyles.helperBox, styles.errorBox]}>
                  <Text style={[sharedStyles.helperText, styles.errorText]}>{calError}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════
          Modal: Preparar (3s antes da aquisição)
      ═══════════════════════════════════════ */}
      <Modal visible={calStep === CAL_PREPARE} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>💪</Text>
            <Text style={styles.modalTitle}>Comece o MVC</Text>
            <Text style={styles.modalSubtitle}>
              Prepara a Máxima Contração Voluntária.{'\n'}A aquisição começa em:
            </Text>
            <Text style={styles.countdownText}>{countdown}s</Text>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={resetCalibration}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: A adquirir (5s)
      ═══════════════════════════════════════ */}
      <Modal visible={calStep === CAL_ACQUIRING} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Animated.View style={[styles.recDot, { opacity: dotAnim }]} />
            <Text style={styles.modalTitle}>A adquirir MVC</Text>
            <Text style={styles.modalSubtitle}>
              Mantém a contração máxima.{'\n'}Pára em:
            </Text>
            <Text style={styles.countdownText}>{countdown}s</Text>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={resetCalibration}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: Parar MVC (3s antes de enviar IDLE)
      ═══════════════════════════════════════ */}
      <Modal visible={calStep === CAL_STOPPING} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>✋</Text>
            <Text style={styles.modalTitle}>Pare o MVC</Text>
            <Text style={styles.modalSubtitle}>
              Relaxa o músculo.{'\n'}O módulo para em:
            </Text>
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: A guardar
      ═══════════════════════════════════════ */}
      <Modal visible={saving} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { gap: 16, alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.modalTitle}>A calcular e guardar...</Text>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: Calibração Concluída
      ═══════════════════════════════════════ */}
      <Modal visible={calStep === CAL_DONE} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>✅</Text>
            <Text style={styles.modalTitle}>Calibração Concluída!</Text>
            <Text style={styles.modalSubtitle}>
              O MVC foi calculado e guardado com sucesso.
            </Text>
            {localModule?.mvc != null && (
              <View style={sharedStyles.helperBox}>
                <Text style={[sharedStyles.helperText, { textAlign: 'center', fontStyle: 'normal' }]}>
                  MVC:{' '}
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>
                    {localModule.mvc.toFixed(4)}
                  </Text>
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={sharedStyles.primaryButton}
              onPress={() => setCalStep(CAL_IDLE)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },

  /* ── Header ── */
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 4,
  },
  backArrow:    { fontSize: 32, color: colors.text.primary, fontWeight: '600', lineHeight: 32 },
  pageTitle:    { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  headerSpacer: { width: 50 },

  /* ── Loading ── */
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ── Scroll ── */
  scroll: { paddingBottom: 32, gap: 14 },

  /* ── Section label ── */
  sectionTitle: {
    fontSize: 14, fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 12, marginTop: 8,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  /* ── Error ── */
  errorBox: { backgroundColor: colors.redBackground, borderColor: colors.text.red + '30' },
  errorText: { color: colors.text.red, fontStyle: 'normal', textAlign: 'center' },

  /* ── Empty state ── */
  emptyCard: {
    backgroundColor: colors.white, padding: 32,
    alignItems: 'center', gap: 10, borderWidth: 1,
  },
  emptyIcon:     { fontSize: 40, marginBottom: 4 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: colors.text.primary, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: colors.text.secondary, textAlign: 'center', lineHeight: 20 },

  /* ── Cards ── */
  sensorGroup: { gap: 12 },
  sensorCard: {
    backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 18, paddingRight: 16, borderWidth: 1,
  },
  iconCircle: { marginRight: 14, marginLeft: 10 },
  cardText:   { flex: 1 },
  cardTitle:    { fontSize: 17, fontWeight: '700', color: colors.text.primary },
  cardSubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 3 },
  mvcText:      { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 3 },
  autoText:     { fontSize: 12, color: colors.secondary, fontWeight: '500', marginTop: 3 },

  /* ── Calibrated badge ── */
  okBadge: {
    backgroundColor: colors.secondary + '25', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center',
  },
  okBadgeText: { fontSize: 13, fontWeight: '700', color: colors.secondary },

  /* ── Calibrar button ── */
  calibrateBtn: {
    backgroundColor: colors.yellowBackground, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.text.yellow,
  },
  calibrateBtnText: { fontSize: 13, fontWeight: '700', color: colors.text.yellow },

  recalibrateBtn: {
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  recalibrateBtnText: { fontSize: 11, fontWeight: '600', color: colors.text.secondary },

  /* ── Modais ── */
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.white,
    borderRadius: 20, paddingHorizontal: 24,
    paddingTop: 28, paddingBottom: 24, gap: 12, alignItems: 'center',
  },
  modalEmoji:    { fontSize: 44, marginBottom: 4 },
  modalTitle: {
    fontSize: 20, fontWeight: '800', color: colors.text.primary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14, color: colors.text.secondary,
    textAlign: 'center', lineHeight: 22,
  },
  countdownText: {
    fontSize: 52, fontWeight: '900', color: colors.primary,
    letterSpacing: -2, lineHeight: 64,
  },
  recDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.text.red, marginBottom: 4,
  },
});