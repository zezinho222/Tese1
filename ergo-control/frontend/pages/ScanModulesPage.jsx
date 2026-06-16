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
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const TYPE_META = {
  sEMG: { icon: '⚡', color: colors.text.yellow, bg: colors.yellowBackground },
  IMU:  { icon: '🧭', color: colors.primary,      bg: '#DBEAFE'              },
  EMS:  { icon: '💪', color: colors.secondary,    bg: '#D1FAE5'              },
};

export default function ScanModulesPage({ navigation, route }) {
  const { moduleType } = route.params;
  const { token } = useAuth();
  const meta = TYPE_META[moduleType] || TYPE_META.sEMG;

  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  // Animação do pulso durante o scan
  const pulse = useRef(new Animated.Value(1)).current;
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
    if (pulseAnim.current) pulseAnim.current.stop();
    pulse.setValue(1);
  };

  const doScan = async () => {
    setScanning(true);
    setDevices([]);
    setSelected(null);
    setError('');
    startPulse();

    try {
      const data = await api.scanModules(token, moduleType);
      if (data.success) {
        setDevices(data.devices || []);
        if ((data.devices || []).length === 0) {
          setError('Nenhum dispositivo encontrado. Confirma que o módulo está ligado e na mesma rede Wi-Fi.');
        }
      } else {
        setError(data.message || 'Erro ao procurar dispositivos.');
      }
    } catch {
      setError('Erro de ligação. Verifica a tua rede Wi-Fi.');
    } finally {
      setScanning(false);
      stopPulse();
    }
  };

  // Scan automático ao entrar na página
  useEffect(() => {
    doScan();
    return () => stopPulse();
  }, []);

  const handleConnect = async () => {
    if (!selected) return;
    const device = devices.find((d) => d.ip === selected);
    if (!device) return;

    setConnecting(true);
    setError('');

    try {
      const data = await api.addModule(token, {
        name: device.name,
        type: moduleType,
        ip: device.ip,
        port: device.port || 80,
        battery: device.battery ?? null,
      });

      if (data.success) {
        // Volta para ModulesPage e dispara refresh
        navigation.navigate('MainTabs', {
          screen: 'Módulos',
          params: { refresh: Date.now() },
        });
      } else {
        setError(data.message || 'Não foi possível guardar o módulo.');
      }
    } catch {
      setError('Erro de ligação. Tenta novamente.');
    } finally {
      setConnecting(false);
    }
  };

  const batteryColor = (b) => {
    if (b == null) return colors.text.secondary;
    if (b >= 60) return colors.secondary;
    if (b >= 30) return colors.text.yellow;
    return colors.text.red;
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
        {/* Título */}
        <Text style={styles.sectionHeading}>Conectar Módulos</Text>

        {/* Stepper — passo 2 activo */}
        <View style={styles.stepper}>
          <View style={[styles.stepDone]}>
            <Text style={styles.stepNumberDone}>✓</Text>
          </View>
          <View style={[styles.stepLine, { backgroundColor: colors.primary }]} />
          <View style={[styles.stepActive]}>
            <Text style={styles.stepNumberActive}>2</Text>
          </View>
          <View style={styles.stepLabels}>
            <Text style={styles.stepLabelDone}>Selecionar</Text>
            <Text style={styles.stepLabelActive}>Procurar</Text>
          </View>
        </View>

        {/* Label */}
        <Text style={styles.sectionLabel}>DISPOSITIVOS ENCONTRADOS</Text>

        {/* Estado: a procurar */}
        {scanning && (
          <View style={styles.scanningWrap}>
            <Animated.View
              style={[
                styles.scanningIconCircle,
                { backgroundColor: meta.bg, transform: [{ scale: pulse }] },
              ]}
            >
              <Text style={styles.scanningIcon}>{meta.icon}</Text>
            </Animated.View>
            <Text style={styles.scanningText}>A procurar módulos {moduleType} na rede Wi-Fi...</Text>
            <ActivityIndicator color={meta.color} style={{ marginTop: 8 }} />
          </View>
        )}

        {/* Lista de dispositivos */}
        {!scanning && devices.length > 0 && (
          <View style={styles.deviceList}>
            {devices.map((device) => {
              const isSelected = selected === device.ip;
              return (
                <TouchableOpacity
                  key={device.ip}
                  style={[
                    sharedStyles.card,
                    styles.deviceCard,
                    isSelected && { borderColor: meta.color, borderWidth: 2 },
                    device.alreadyConnected && styles.deviceCardDisabled,
                  ]}
                  onPress={() => !device.alreadyConnected && setSelected(device.ip)}
                  activeOpacity={device.alreadyConnected ? 1 : 0.82}
                >
                  {/* Ícone */}
                  <View
                    style={[
                      sharedStyles.iconCircle,
                      styles.deviceIconCircle,
                      { backgroundColor: isSelected ? meta.bg : colors.cardBg },
                    ]}
                  >
                    <Text style={styles.deviceIcon}>📶</Text>
                  </View>

                  {/* Info */}
                  <View style={styles.deviceInfo}>
                    <Text
                      style={[
                        styles.deviceName,
                        isSelected && { color: meta.color },
                      ]}
                    >
                      {device.name}
                    </Text>
                    <View style={styles.deviceMeta}>
                      <Text style={styles.deviceIp}>{device.ip}</Text>
                      {device.battery != null && (
                        <Text style={[styles.deviceBattery, { color: batteryColor(device.battery) }]}>
                          🔋 {device.battery}%
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Estado */}
                  {device.alreadyConnected ? (
                    <View style={styles.connectedBadge}>
                      <Text style={styles.connectedBadgeText}>Ligado</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        sharedStyles.checkboxCircle,
                        isSelected && { borderColor: meta.color },
                      ]}
                    >
                      {isSelected && (
                        <View
                          style={[sharedStyles.checkboxDot, { backgroundColor: meta.color }]}
                        />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Erro */}
        {!scanning && error !== '' && (
          <View style={[sharedStyles.helperBox, styles.errorBox]}>
            <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
          </View>
        )}

        {/* Botão Voltar a procurar */}
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

      {/* Botão Ligar */}
      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={[
            sharedStyles.primaryButton,
            { backgroundColor: selected ? meta.color : colors.disabled },
            (connecting || !selected) && { opacity: 0.85 },
          ]}
          onPress={handleConnect}
          activeOpacity={0.85}
          disabled={!selected || connecting}
        >
          {connecting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={sharedStyles.primaryButtonText}>
              {selected
                ? `Ligar a ${devices.find((d) => d.ip === selected)?.name || ''}`
                : 'Seleciona um dispositivo'}
            </Text>
          )}
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
  headerSpacer: { width: 50 },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  /* ── Heading ── */
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
  stepDone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberDone: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    maxWidth: 40,
    backgroundColor: colors.primary,
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

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 28,
  },

  /* ── Scanning state ── */
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

  /* ── Device list ── */
  deviceList: {
    gap: 12,
  },
  deviceCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    borderWidth: 1,
  },
  deviceCardDisabled: {
    opacity: 0.6,
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
  deviceMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  deviceIp: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  deviceBattery: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* ── Already connected badge ── */
  connectedBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  connectedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },

  /* ── Error box ── */
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

  /* ── Rescan button ── */
  rescanBtn: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
  },
  rescanIcon: {
    fontSize: 18,
  },
  rescanText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
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