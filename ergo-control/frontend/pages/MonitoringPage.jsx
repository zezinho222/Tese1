import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import LiveLineChart from '../components/LiveLineChart';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import moduleService from '../moduleService';
import monitoringService from '../monitoringService';


const STORAGE_KEY = '@ergocontrol/connected_module';

// Largura do gráfico = largura do ecrã menos o padding do ScrollView (20*2)
// e o padding interno dos cards (16*2)
const CHART_WIDTH = Dimensions.get('window').width - 20 * 2 - 16 * 2;

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };

const IMU_AXIS_COLORS = [colors.primary, colors.secondary]; // Pitch, Roll

export default function MonitoringPage({ navigation }) {
  const { token } = useAuth();

  const [localModule,     setLocalModule]     = useState(null);
  const [showStopModal,   setShowStopModal]   = useState(false);
  const [showNoModModal,  setShowNoModModal]  = useState(false);
  const [showNoCal,       setShowNoCal]       = useState(false);
  const [stopping,        setStopping]        = useState(false); // "a guardar sessão..." — só relevante para a paragem manual, enquanto o ecrã está montado
  const [error,           setError]           = useState('');

  // A monitorização em si (timers, deteção de alertas, sessão em curso) vive
  // em monitoringService — um singleton — e não neste componente. Assim,
  // navegar para outro ecrã (ex: seta de "voltar") não a interrompe: ela
  // continua a correr em segundo plano, incluindo o envio de notificações
  // de alerta. Este ecrã é só uma "vista" que subscreve o estado atual.
  const [monState, setMonState] = useState(monitoringService.getState());

  useEffect(() => monitoringService.subscribe(setMonState), []);

  const { isMonitoring, elapsedSec, alertCount, emgPoints, imuPoints } = monState;

  const emgSeries = useMemo(
    () => [{ data: emgPoints, color: colors.text.yellow }],
    [emgPoints]
  );
  const imuSeries = useMemo(
    () => IMU_AXIS_COLORS.map((axisColor, i) => ({
      data: imuPoints.map((p) => p?.[i] ?? 0),
      color: axisColor,
    })),
    [imuPoints]
  );

  // ── Carregar módulo ────────────────────────────────────────────────────────
  const loadModule = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setLocalModule(raw ? JSON.parse(raw) : null);
    } catch {}
  };

  useFocusEffect(useCallback(() => { loadModule(); }, []));

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
      setError('A ligar ao módulo...');
      const reconnected = await moduleService.ensureConnected({
        offsetValue: localModule.offsetValue,
        freqValue: localModule.freqValue,
      });
      if (!reconnected) {
        setError('Módulo não está ligado. Confirma que estás na rede Wi-Fi do módulo e tenta novamente.');
        return;
      }
    }

    setError('');
    await monitoringService.start({
      sensorType,
      mvc: localModule.mvc ?? null,
      token,
    });
  };

  // ── Confirmar paragem (manual) ───────────────────────────────────────────────
  const handleConfirmStop = async () => {
    setShowStopModal(false);
    setStopping(true);
    await monitoringService.stop();
    setStopping(false);
  };

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
      <LiveLineChart
        series={emgSeries}
        width={CHART_WIDTH}
        height={72}
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
    return (
      <LiveLineChart
        series={imuSeries}
        width={CHART_WIDTH}
        height={72}
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
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => navigation.navigate('ChartFullscreen', { type: 'EMG' })}
                activeOpacity={0.7}
              >
                <Ionicons name="expand-outline" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            {localModule?.mvc != null && (
              <Text style={styles.mvcLabel}>MVC: {localModule.mvc.toFixed(2)}</Text>
            )}
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
              <Text style={styles.sectionTitle}>🧭 IMU - Dados de Medição Enercial        </Text>
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
                    <Text style={[styles.imuAxis, { color: IMU_AXIS_COLORS[i] }]}>
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
        {stopping ? (
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  mvcLabel: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 10,
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
