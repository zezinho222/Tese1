import React, { useState, useCallback } from 'react';
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
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import syncService from '../syncService';

const STORAGE_KEY = '@ergocontrol/connected_module';

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };

export default function ModulesPage({ navigation }) {
  const { token } = useAuth();

  const [localModule, setLocalModule]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [moduleToRemove, setModuleToRemove] = useState(false);
  const [removing, setRemoving]           = useState(false);
  const [error, setError]                 = useState('');
  const [showWifiModal, setShowWifiModal] = useState(false);

  // ─── Carregar módulo (fonte de verdade local, com tentativa de sync) ──
  const loadModule = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      // Tenta sincronizar em segundo plano se houver internet real
      syncService.trySyncAll(token);
      const mod = await syncService.getLocalModule();
      setLocalModule(mod);
    } catch {
      setError('Erro ao carregar módulo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => { loadModule(); }, [])
  );

  // ─── Remover módulo ───────────────────────────────────────────────────
  const confirmRemove = async () => {
    setRemoving(true);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      // Tenta também remover do backend (pode falhar se sem internet)
      if (localModule?.backendId && token) {
        await api.removeModule(token, localModule.backendId).catch(() => {});
      }
      setLocalModule(null);
    } catch {
      setError('Erro ao desligar módulo.');
    } finally {
      setRemoving(false);
      setModuleToRemove(false);
    }
  };

  const handleConnectPress = () => setShowWifiModal(true);

  const handleWifiConfirm = () => {
    setShowWifiModal(false);
    navigation.navigate('ScanModules');
  };

  const batteryColor = (b) => {
    if (b == null) return colors.text.secondary;
    if (b >= 60)   return colors.secondary;
    if (b >= 30)   return colors.text.yellow;
    return colors.text.red;
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <Text style={styles.pageTitle}>Módulos</Text>

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
          {error !== '' && (
            <View style={[sharedStyles.helperBox, styles.errorBox]}>
              <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
            </View>
          )}

          {/* ── Módulo conectado ── */}
          {localModule ? (
            <View style={[sharedStyles.card, styles.card]}>
              <View style={styles.cardHeader}>
                <View style={[sharedStyles.iconCircle, styles.iconCircle, { backgroundColor: colors.infoBorder }]}>
                  <Text style={sharedStyles.iconText}>📡</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{localModule.name || 'ErgoControl'}</Text>
                  <Text style={styles.cardSubtitle}>{localModule.ip}</Text>
                  {localModule.sensorSelection && (
                    <Text style={styles.sensorBadgeText}>
                      {SENSOR_LABELS[localModule.sensorSelection] || localModule.sensorSelection}
                    </Text>
                  )}
                </View>
                <View style={[styles.badge, styles.badgeOn]}>
                  <Text style={[styles.badgeText, styles.badgeTextOn]}>Ligado</Text>
                </View>
              </View>

              {localModule.synced === false && (
                <View style={styles.syncBadge}>
                  <Text style={styles.syncBadgeText}>⏳ Por sincronizar com o servidor</Text>
                </View>
              )}

              {localModule.synced === false && (
                <View style={styles.syncBadge}>
                  <Text style={styles.syncBadgeText}>📡 Ligue-se a uma rede Wi-Fi com internet para sincronizar</Text>
                </View>
              )}

              {/* Offset e Frequência */}
              {(localModule.offsetLabel || localModule.freqHz) && (
                <View style={styles.configRow}>
                  {localModule.offsetLabel && (
                    <View style={styles.configItem}>
                      <Text style={styles.configLabel}>Offset</Text>
                      <Text style={styles.configValue}>{localModule.offsetLabel}</Text>
                    </View>
                  )}
                  {localModule.freqHz && (
                    <View style={styles.configItem}>
                      <Text style={styles.configLabel}>Frequência</Text>
                      <Text style={styles.configValue}>{localModule.freqHz} Hz</Text>
                    </View>
                  )}
                  {localModule.mvc != null && (
                    <View style={styles.configItem}>
                      <Text style={styles.configLabel}>MVC</Text>
                      <Text style={styles.configValue}>{localModule.mvc.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Bateria
              <View style={styles.batteryRow}>
                <Text style={styles.batteryLabel}>Bateria</Text>
                <View style={styles.batteryBarWrap}>
                  {localModule.battery != null && (
                    <View
                      style={[
                        styles.batteryBar,
                        { width: `${localModule.battery}%`, backgroundColor: batteryColor(localModule.battery) },
                      ]}
                    />
                  )}
                </View>
                <Text style={[styles.batteryPct, { color: batteryColor(localModule.battery) }]}>
                  {localModule.battery != null ? `${localModule.battery}%` : '—'}
                </Text>
              </View>
              */}

              <TouchableOpacity
                style={[sharedStyles.redButton, styles.disconnectBtn]}
                onPress={() => setModuleToRemove(true)}
                activeOpacity={0.85}
              >
                <Text style={sharedStyles.redText}>Desligar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[sharedStyles.card, styles.emptyCard]}>
              <Text style={styles.emptyIcon}>🔌</Text>
              <Text style={styles.emptyTitle}>Sem módulo ligado</Text>
              <Text style={styles.emptySubtitle}>
                Clica em "Conectar Módulo" para ligar ao dispositivo via Wi-Fi.
              </Text>
            </View>
          )}

          {/* ── Botão Conectar ── */}
          <TouchableOpacity
            style={sharedStyles.primaryButton}
            onPress={handleConnectPress}
            activeOpacity={0.85}
          >
            <Text style={sharedStyles.primaryButtonText}>+ Conectar Módulo</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Modal: Aviso WiFi ── */}
      <Modal
        visible={showWifiModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWifiModal(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowWifiModal(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>📶</Text>
            </View>
            <Text style={styles.modalTitle}>Ligação Wi-Fi necessária</Text>
            <Text style={styles.modalSubtitle}>
              Antes de continuar, liga o teu telemóvel à rede Wi-Fi do módulo ErgoControl nas definições do sistema.
            </Text>
            <View style={[sharedStyles.helperBox, { marginBottom: 4 }]}>
              <Text style={[sharedStyles.helperText, { textAlign: 'center', fontStyle: 'normal' }]}>
                🔐 Rede: <Text style={{ fontWeight: '700', color: colors.text.primary }}>Wearable EMG</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, { marginTop: 4 }]}
              onPress={handleWifiConfirm}
              activeOpacity={0.85}
            >
              <Text style={[sharedStyles.primaryButtonText, { fontSize: 16 }]}>Já estou ligado - Continuar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton, { marginTop: 0 }]}
              onPress={() => setShowWifiModal(false)}
              activeOpacity={0.85}
            >
              <Text style={sharedStyles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: Confirmar desligar ── */}
      <Modal
        visible={moduleToRemove}
        transparent
        animationType="fade"
        onRequestClose={() => setModuleToRemove(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModuleToRemove(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitle}>
              Tens a certeza que{'\n'}queres desligar o módulo?
            </Text>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton]}
              onPress={confirmRemove}
              activeOpacity={0.85}
              disabled={removing}
            >
              {removing
                ? <ActivityIndicator color={colors.white} />
                : <Text style={sharedStyles.confirmButtonText}>Sim, desligar!</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={() => setModuleToRemove(false)}
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
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    paddingVertical: 40,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingBottom: 32,
    gap: 16,
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
  emptyCard: {
    backgroundColor: colors.white,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: 12,
    marginLeft: 0,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sensorBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 2,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: { backgroundColor: colors.secondary + '25' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: colors.secondary },
  syncBadge: {
    backgroundColor: colors.text.yellow + '20',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  syncBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.yellow,
    textAlign: 'center',
  },
  configRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  configItem: { alignItems: 'center', flex: 1 },
  configLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  configValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  batteryLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    width: 50,
  },
  batteryBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  batteryBar: { height: 8, borderRadius: 4 },
  batteryPct: {
    fontSize: 13,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  disconnectBtn: {
    paddingVertical: 12,
    borderRadius: 18,
    marginHorizontal: 0,
    marginTop: 0,
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
  modalIconWrap: { alignItems: 'center', marginBottom: 4 },
  modalIcon: { fontSize: 40 },
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
});