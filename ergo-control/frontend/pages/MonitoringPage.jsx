import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import moduleService from '../moduleService';
import syncService from '../syncService';


const STORAGE_KEY    = '@ergocontrol/connected_module';
const DISPLAY_POINTS = 20;  // quantos pontos mostrar no gráfico
const REFRESH_MS     = 300; // intervalo de atualização do gráfico

// Largura do gráfico = largura do ecrã menos o padding do ScrollView (20*2)
// e o padding interno dos cards (16*2)
const CHART_WIDTH = Dimensions.get('window').width - 20 * 2 - 16 * 2;

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };

export default function MonitoringPage({ navigation }) {
  const { token } = useAuth();

  const [localModule,     setLocalModule]     = useState(null);
  const [isMonitoring,    setIsMonitoring]    = useState(false);
  const [showStopModal,   setShowStopModal]   = useState(false);
  const [showNoModModal,  setShowNoModModal]  = useState(false);
  const [showNoCal,       setShowNoCal]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');

  // Dados para o gráfico
  const [emgPoints,   setEmgPoints]   = useState([]);
  const [imuPoints,   setImuPoints]   = useState([]);
  const [elapsedSec,  setElapsedSec]  = useState(0);
  const [alertCount,  setAlertCount]  = useState(0);

  const sessionIdRef    = useRef(null);  // ID da sessão no backend
  const startTimeRef    = useRef(null);
  const elapsedRef      = useRef(null);
  const graphIntervalRef = useRef(null);
  const alertCountRef   = useRef(0);

  // ── Carregar módulo ────────────────────────────────────────────────────────
  const loadModule = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setLocalModule(raw ? JSON.parse(raw) : null);
    } catch {}
  };

  useFocusEffect(useCallback(() => { loadModule(); }, []));

  // ── Subscrição aos dados WebSocket ─────────────────────────────────────────
  useEffect(() => {
    moduleService.addListener('monitoring', (_, parsed) => {
      // Os buffers são geridos internamente pelo moduleService;
      // aqui apenas disparamos uma flag para o intervalo de atualização do gráfico
    });
    return () => moduleService.removeListener('monitoring');
  }, []);

  // ── Atualização periódica do gráfico ───────────────────────────────────────
  const startGraphRefresh = () => {
    graphIntervalRef.current = setInterval(() => {
      const { emgBuffer, imuBuffer } = moduleService.getBuffers();
      const emgSlice = emgBuffer.slice(-DISPLAY_POINTS);
      const imuSlice = imuBuffer.slice(-DISPLAY_POINTS);
      setEmgPoints([...emgSlice]);
      setImuPoints([...imuSlice]);
    }, REFRESH_MS);
  };

  const stopGraphRefresh = () => clearInterval(graphIntervalRef.current);

  // ── Temporizador de sessão ─────────────────────────────────────────────────
  const startTimer = () => {
    setElapsedSec(0);
    elapsedRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  };

  const stopTimer = () => {
    clearInterval(elapsedRef.current);
  };

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

// ── Iniciar monitorização ──────────────────────────────────────────────────
  const handleStartMonitoring = async () => {
    if (!localModule) {
      setShowNoModModal(true);
      return;
    }

    const sensorType = localModule.sensorSelection;
    const needsEMG   = sensorType === 'EMG' || sensorType === 'DUAL';

    if (needsEMG && !localModule.calibrated?.sEMG) {
      setShowNoCal(true);
      return;
    }

    if (!moduleService.isConnected()) {
      setError('Módulo não está ligado. Vai à página Módulos e reconecta.');
      return;
    }

    setError('');
    alertCountRef.current = 0;
    setAlertCount(0);
    setEmgPoints([]);
    setImuPoints([]);

    // Regista a sessão sempre localmente primeiro — funciona mesmo sem internet
    // (estás ligado à Wi-Fi do módulo, sem acesso à internet, durante a monitorização)
    const now = new Date();
    startTimeRef.current = now;
    const localId = await syncService.queueNewSession({
      sensorType,
      startTime: now.toISOString(),
      mvc: localModule.mvc ?? null,
    });
    sessionIdRef.current = localId;

    // Tentativa de sincronização em segundo plano — não bloqueia nem falha visivelmente
    // se não houver internet; o listener em App.js trata disso mais tarde.
    syncService.trySyncAll(token);

    // Inicia monitorização no serviço (envia EMG / IMU / DUAL)
    moduleService.startMonitoring(sensorType);

    setIsMonitoring(true);
    startTimer();
    startGraphRefresh();
  };

  // ── Confirmar paragem ──────────────────────────────────────────────────────
  const handleConfirmStop = async () => {
    setShowStopModal(false);
    setSaving(true);

    stopTimer();
    stopGraphRefresh();

    const { emgBuffer, imuBuffer } = moduleService.stopMonitoring(); // envia IDLE internamente

    const endTime  = new Date();
    const duration = elapsedSec;

    // Atualiza a sessão local com os dados finais — sempre grava, mesmo offline.
    // Os buffers são reduzidos (downsample) antes de guardar, para não gravar
    // sessões inteiras ao segundo (podem ter milhares de amostras).
    if (sessionIdRef.current) {
      await syncService.queueSessionEnd(sessionIdRef.current, {
        endTime:    endTime.toISOString(),
        duration,
        mvc:        localModule?.mvc ?? null,
        alertCount: alertCountRef.current,
        emgData:    syncService.downsampleArray(emgBuffer),
        imuData:    syncService.downsampleArray(imuBuffer),
      });
      syncService.trySyncAll(token);
    }

    sessionIdRef.current = null;
    setIsMonitoring(false);
    setElapsedSec(0);
    setSaving(false);
  };

  // ── Cleanup ao desmontar ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTimer();
      stopGraphRefresh();
    };
  }, []);

  // ── Gráfico de linha — sEMG (mesmo estilo do gráfico IMU) ───────────────────
  const renderEmgLine = () => {
    if (!emgPoints || emgPoints.length === 0) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados - Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <LineChart
        data={emgPoints.map((v) => ({ value: v }))}
        height={72}
        width={CHART_WIDTH}
        color={colors.text.yellow}
        thickness={2}
        curved
        hideDataPoints
        hideAxesAndRules
        initialSpacing={0}
        endSpacing={0}
        disableScroll
        adjustToWidth
      />
    );
  };

  // ── Gráfico de linha — IMU (Pitch, Roll) ────────────────────────────────────
  const renderImuLine = () => {
    if (!imuPoints || imuPoints.length === 0) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados - Inicia a monitorização</Text>
        </View>
      );
    }
    const axisColors = [colors.primary, colors.secondary]; // Pitch, Roll
    return (
      <LineChart
        dataSet={axisColors.map((axisColor, i) => ({
          data: imuPoints.map((p) => ({ value: p?.[i] ?? 0 })),
          color: axisColor,
        }))}
        height={72}
        width={CHART_WIDTH}
        thickness={2}
        curved
        hideDataPoints
        hideAxesAndRules
        initialSpacing={0}
        endSpacing={0}
        disableScroll
        adjustToWidth
      />
    );
  };

  const showEMG = localModule?.sensorSelection === 'EMG'  || localModule?.sensorSelection === 'DUAL';
  const showIMU = localModule?.sensorSelection === 'IMU'  || localModule?.sensorSelection === 'DUAL';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Monitorizar</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Status bar ── */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>
          {localModule
            ? SENSOR_LABELS[localModule.sensorSelection] || localModule.sensorSelection
            : 'Sem módulo'}
        </Text>
        <View style={[styles.statusBadge, isMonitoring ? styles.statusBadgeActive : styles.statusBadgeIdle]}>
          <View style={[styles.statusDot, isMonitoring ? styles.statusDotActive : styles.statusDotIdle]} />
          <Text style={[styles.statusBadgeText, isMonitoring ? styles.statusBadgeTextActive : styles.statusBadgeTextIdle]}>
            {isMonitoring ? `A monitorizar • ${formatElapsed(elapsedSec)}` : 'À espera de início'}
          </Text>
        </View>
      </View>

      {error !== '' && (
        <View style={[sharedStyles.helperBox, styles.errorBox]}>
          <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── sEMG ── */}
        {showEMG && (
          <View style={[sharedStyles.card, styles.sectionCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>⚡ sEMG - Atividade Muscular</Text>
              <View style={styles.cardHeaderRight}>
                {localModule?.mvc != null && (
                  <Text style={styles.mvcLabel}>MVC: {localModule.mvc.toFixed(2)}</Text>
                )}
                <TouchableOpacity
                  style={styles.expandBtn}
                  onPress={() => navigation.navigate('ChartFullscreen', { type: 'EMG' })}
                  activeOpacity={0.7}
                >
                  <Ionicons name="expand-outline" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.graphArea}>
              {renderEmgLine()}
            </View>
            {emgPoints.length > 0 && (
              <Text style={styles.latestValue}>
                Último valor: {emgPoints[emgPoints.length - 1]?.toFixed(2)}
              </Text>
            )}
          </View>
        )}

        {/* ── IMU ── */}
        {showIMU && (
          <View style={[sharedStyles.card, styles.sectionCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>🧭 IMU - Dados de ola</Text>
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => navigation.navigate('ChartFullscreen', { type: 'IMU' })}
                activeOpacity={0.7}
              >
                <Ionicons name="expand-outline" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.graphArea}>
              {renderImuLine()}
            </View>
            {imuPoints.length > 0 && (
              <View style={styles.imuValuesRow}>
                {['Pitch', 'Roll'].map((ax, i) => (
                  <View key={ax} style={styles.imuValue}>
                    <Text style={[styles.imuAxis, { color: [colors.primary, colors.secondary][i] }]}>
                      {ax}
                    </Text>
                    <Text style={styles.imuVal}>
                      {(imuPoints[imuPoints.length - 1]?.[i] ?? 0).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Sem módulo ── */}
        {!localModule && (
          <View style={[sharedStyles.card, styles.emptyCard]}>
            <Text style={styles.emptyIcon}>🔌</Text>
            <Text style={styles.emptyTitle}>Sem módulo ligado</Text>
            <Text style={styles.emptySubtitle}>
              Liga um módulo na página "Módulos" antes de iniciar a monitorização.
            </Text>
          </View>
        )}

        {/* ── Estatísticas de sessão ── */}
        {isMonitoring && (
          <View style={[sharedStyles.card, styles.statsCard]}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatElapsed(elapsedSec)}</Text>
              <Text style={styles.statLabel}>Duração</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{alertCount}</Text>
              <Text style={styles.statLabel}>Alertas</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Botão Iniciar / Parar ── */}
      <View style={styles.bottomWrap}>
        {saving ? (
          <View style={[sharedStyles.primaryButton, styles.startBtn, { backgroundColor: colors.disabled }]}>
            <ActivityIndicator color={colors.white} />
            <Text style={sharedStyles.primaryButtonText}>A guardar sessão...</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              sharedStyles.primaryButton,
              styles.startBtn,
              isMonitoring && styles.stopBtn,
            ]}
            onPress={isMonitoring ? () => setShowStopModal(true) : handleStartMonitoring}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnIcon}>{isMonitoring ? '■' : '▶'}</Text>
            <Text style={sharedStyles.primaryButtonText}>
              {isMonitoring ? 'Parar Monitorização' : 'Iniciar Monitorização'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ═══════════════════════════════════════
          Modal: Confirmar paragem
      ═══════════════════════════════════════ */}
      <Modal visible={showStopModal} transparent animationType="fade" onRequestClose={() => setShowStopModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowStopModal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitle}>Tens a certeza que queres{'\n'}parar a monitorização?</Text>
            <Text style={styles.modalSubtitle}>
              A sessão será guardada automaticamente no histórico.
            </Text>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton]}
              onPress={handleConfirmStop}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.confirmButtonText}>Sim, parar!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={() => setShowStopModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Não, cancelar!</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: Sem módulo
      ═══════════════════════════════════════ */}
      <Modal visible={showNoModModal} transparent animationType="fade" onRequestClose={() => setShowNoModModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowNoModModal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalEmoji}>🔌</Text>
            <Text style={styles.modalTitle}>Sem módulo ligado</Text>
            <Text style={styles.modalSubtitle}>
              Conecta um módulo na página "Módulos" antes de iniciar a monitorização.
            </Text>
            <TouchableOpacity
              style={sharedStyles.primaryButton}
              onPress={() => {
                setShowNoModModal(false);
                navigation.navigate('MainTabs', { screen: 'Módulos' });
              }}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Ir para Módulos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={() => setShowNoModModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══════════════════════════════════════
          Modal: sEMG não calibrado
      ═══════════════════════════════════════ */}
      <Modal visible={showNoCal} transparent animationType="fade" onRequestClose={() => setShowNoCal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowNoCal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <View style={[sharedStyles.closeButton, { width: 56, height: 56, borderRadius: 28, alignSelf: 'center' }]}>
              <Text style={sharedStyles.closeButtonText}>✕</Text>
            </View>
            <Text style={styles.modalTitle}>Erro!</Text>
            <Text style={styles.modalSubtitle}>
              Antes de iniciar a monitorização tens de calibrar o sensor sEMG!
            </Text>
            <TouchableOpacity
              style={sharedStyles.primaryButton}
              onPress={() => {
                setShowNoCal(false);
                navigation.navigate('Calibrate');
              }}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.primaryButtonText}>Calibrar</Text>
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

  /* ── Status bar ── */
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
    fontWeight: '600',
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
    backgroundColor: colors.secondary + '25',
    borderWidth: 1,
    borderColor: colors.secondary + '80',
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

  /* ── Error ── */
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
    marginHorizontal: 20,
    marginBottom: 4,
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },

  /* ── Cards de sensor ── */
  sectionCard: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  mvcLabel: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  expandBtn: {
    padding: 4,
  },

  /* ── Gráfico ── */
  graphArea: {
    height: 72,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  graphEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },

  latestValue: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 6,
    textAlign: 'right',
  },
  imuValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 8,
  },
  imuValue: {
    alignItems: 'center',
    gap: 2,
  },
  imuAxis: {
    fontSize: 11,
    fontWeight: '700',
  },
  imuVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },

  /* ── Empty state ── */
  emptyCard: {
    backgroundColor: colors.white,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Estatísticas de sessão ── */
  statsCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },

  /* ── Botão Iniciar / Parar ── */
  bottomWrap: {
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
    gap: 8,
  },
  stopBtn: {
    backgroundColor: colors.text.red,
    shadowColor: colors.text.red,
  },
  startBtnIcon: {
    fontSize: 14,
    color: colors.white,
  },

  /* ── Modais ── */
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
  modalEmoji: {
    fontSize: 40,
    textAlign: 'center',
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
    lineHeight: 22,
  },
});