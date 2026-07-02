import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import moduleService from '../moduleService';

const MODULE_IP   = '192.168.4.1';
const MODULE_NAME = 'ErgoControl';

export default function ScanModulesPage({ navigation }) {
  const [scanning,   setScanning]   = useState(false);
  const [found,      setFound]      = useState(false);    // módulo encontrado
  const [selected,   setSelected]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState('');

  const pulse     = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(null);

  const startPulse = () => {
    pulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulseAnim.current.start();
  };

  const stopPulse = () => {
    pulseAnim.current?.stop();
    pulse.setValue(1);
  };

  // ─── Ping ao módulo ────────────────────────────────────────────────────────
  const doScan = async () => {
    setScanning(true);
    setFound(false);
    setSelected(false);
    setError('');
    startPulse();

    try {
      const reachable = await moduleService.isModuleReachable();
      if (reachable) {
        setFound(true);
      } else {
        setError(
          'Módulo não encontrado.\nConfirma que estás ligado à rede Wi-Fi do módulo ErgoControl e que o dispositivo está ligado.'
        );
      }
    } catch {
      setError('Erro ao procurar. Verifica a ligação Wi-Fi.');
    } finally {
      setScanning(false);
      stopPulse();
    }
  };

  useEffect(() => {
    doScan();
    return () => stopPulse();
  }, []);

  // ─── Ligar via WebSocket ───────────────────────────────────────────────────
  const handleConnect = () => {
    if (!selected) return;
    setConnecting(true);
    setError('');

    moduleService.connect({
      onOpen: () => {
        setConnecting(false);
        // Navega para o Passo 2 (Selecionar sensores + configurações)
        navigation.navigate('ConnectModule');
      },
      onError: () => {
        setConnecting(false);
        setError('Não foi possível ligar ao módulo. Tenta novamente.');
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Módulos</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>Conectar Módulos</Text>

        {/* ── Stepper: Passo 1 ativo ── */}
        <View style={styles.stepper}>
          <View style={styles.stepActive}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
          <View style={styles.stepInactive}>
            <Text style={styles.stepNumberInactive}>2</Text>
          </View>
          <View style={styles.stepLabels}>
            <Text style={styles.stepLabelActive}>Procurar</Text>
            <Text style={styles.stepLabelInactive}>Selecionar</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>DISPOSITIVO</Text>

        {/* ── A procurar ── */}
        {scanning && (
          <View style={styles.scanningWrap}>
            <Animated.View
              style={[
                styles.scanningIconCircle,
                { backgroundColor: colors.infoBorder, transform: [{ scale: pulse }] },
              ]}
            >
              <Text style={styles.scanningIcon}>📡</Text>
            </Animated.View>
            <Text style={styles.scanningText}>
              A procurar módulo em {MODULE_IP}...
            </Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
          </View>
        )}

        {/* ── Módulo encontrado ── */}
        {!scanning && found && (
          <TouchableOpacity
            style={[
              sharedStyles.card,
              styles.deviceCard,
              selected && { borderColor: colors.secondary, borderWidth: 2 },
            ]}
            onPress={() => setSelected((v) => !v)}
            activeOpacity={0.82}
          >
            <View style={[sharedStyles.iconCircle, styles.deviceIconCircle, { backgroundColor: selected ? colors.secondary + '25' : colors.cardBg }]}>
              <Text style={styles.deviceIcon}>📶</Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={[styles.deviceName, selected && { color: colors.secondary }]}>
                {MODULE_NAME}
              </Text>
              <Text style={styles.deviceIp}>{MODULE_IP}</Text>
            </View>
            <View style={[sharedStyles.checkboxCircle, selected && sharedStyles.checkboxSelected]}>
              {selected && <View style={sharedStyles.checkboxDot} />}
            </View>
          </TouchableOpacity>
        )}

        {/* ── Erro ── */}
        {!scanning && error !== '' && (
          <View style={[sharedStyles.helperBox, styles.errorBox]}>
            <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
          </View>
        )}

        {/* ── Voltar a procurar ── */}
        {!scanning && (
          <TouchableOpacity
            style={[sharedStyles.card, styles.rescanBtn]}
            onPress={doScan}
            activeOpacity={0.82}
          >
            <Text style={styles.rescanIcon}>🔄</Text>
            <Text style={styles.rescanText}>Voltar a procurar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Botão Ligar ── */}
      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={[
            sharedStyles.primaryButton,
            { backgroundColor: selected ? colors.secondary : colors.disabled },
            (!selected || connecting) && { opacity: 0.85 },
          ]}
          onPress={handleConnect}
          activeOpacity={0.85}
          disabled={!selected || connecting}
        >
          {connecting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={sharedStyles.primaryButtonText}>
                {selected ? `Ligar a ${MODULE_NAME}` : 'Seleciona o dispositivo'}
              </Text>
          }
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
    marginBottom: 12,
    marginTop: 12,
  },

  /* ── Stepper ── */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
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
  stepNumber: {
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
    bottom: -22,
    left: 0,
    right: 0,
    flexDirection: 'row',
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

  /* ── A procurar ── */
  scanningWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  scanningIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  scanningIcon: {
    fontSize: 34,
  },
  scanningText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Card do dispositivo ── */
  deviceCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingRight: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  deviceIconCircle: {
    marginLeft: 12,
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.border,
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  deviceIcon: {
    fontSize: 22,
  },
  deviceInfo: {
    flex: 1,
    gap: 3,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  deviceIp: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },

  /* ── Erro ── */
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
    marginBottom: 12,
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },

  /* ── Botão re-scan ── */
  rescanBtn: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  rescanIcon: {
    fontSize: 18,
  },
  rescanText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },

  /* ── Rodapé ── */
  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});