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
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const TYPE_META = {
  sEMG: { icon: '⚡', color: colors.text.yellow, bg: colors.yellowBackground },
  IMU:  { icon: '🧭', color: colors.primary,      bg: '#DBEAFE'              },
  EMS:  { icon: '💪', color: colors.secondary,    bg: '#D1FAE5'              },
};

const batteryColor = (b) => {
  if (b == null) return colors.text.secondary;
  if (b >= 60) return colors.secondary;
  if (b >= 30) return colors.text.yellow;
  return colors.text.red;
};

export default function ModulesPage({ navigation }) {
  const { token } = useAuth();

  const [modules, setModules]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [moduleToRemove, setModuleToRemove] = useState(null);
  const [removing, setRemoving]         = useState(false);
  const [error, setError]               = useState('');

  /* ── Carregar módulos ── */
  const loadModules = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api.getModules(token);
      if (data.success) {
        setModules(data.modules || []);
      } else {
        setError(data.message || 'Erro ao carregar módulos.');
      }
    } catch {
      setError('Sem ligação ao servidor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarrega sempre que a página ganha foco (ex: ao voltar do ConnectModulePage)
  useFocusEffect(
    useCallback(() => {
      loadModules();
    }, [])
  );

  /* ── Remover módulo ── */
  const confirmRemove = async () => {
    if (!moduleToRemove) return;
    setRemoving(true);
    try {
      const data = await api.removeModule(token, moduleToRemove);
      if (data.success) {
        setModules((prev) => prev.filter((m) => m._id !== moduleToRemove));
      } else {
        setError(data.message || 'Erro ao remover módulo.');
      }
    } catch {
      setError('Erro de ligação.');
    } finally {
      setRemoving(false);
      setModuleToRemove(null);
    }
  };

  /* ── Render ── */
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
              onRefresh={() => loadModules(true)}
              tintColor={colors.primary}
            />
          }
        >
          {/* Erro de rede */}
          {error !== '' && (
            <View style={[sharedStyles.helperBox, styles.errorBox]}>
              <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
            </View>
          )}

          {/* Lista de módulos */}
          {modules.length === 0 && error === '' ? (
            <View style={[sharedStyles.card, styles.emptyCard]}>
              <Text style={styles.emptyIcon}>🔌</Text>
              <Text style={styles.emptyTitle}>Sem módulos ligados</Text>
              <Text style={styles.emptySubtitle}>
                Clica em "Conectar Módulo" para adicionar um dispositivo via Wi-Fi.
              </Text>
            </View>
          ) : (
            <View style={styles.moduleCards}>
              {modules.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.sEMG;
                return (
                  <View key={m._id} style={[sharedStyles.card, styles.card]}>
                    {/* Cabeçalho */}
                    <View style={styles.cardHeader}>
                      <View
                        style={[
                          sharedStyles.iconCircle,
                          styles.iconCircle,
                          { backgroundColor: meta.bg },
                        ]}
                      >
                        <Text style={sharedStyles.iconText}>{meta.icon}</Text>
                      </View>
                      <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>{m.name}</Text>
                        <Text style={styles.cardSubtitle}>{m.type} · {m.ip}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeOn]}>
                        <Text style={[styles.badgeText, styles.badgeTextOn]}>Ligado</Text>
                      </View>
                    </View>

                    {/* Bateria */}
                    <View style={styles.batteryRow}>
                      <Text style={styles.batteryLabel}>Bateria</Text>
                      <View style={styles.batteryBarWrap}>
                        {m.battery != null && (
                          <View
                            style={[
                              styles.batteryBar,
                              { width: `${m.battery}%`, backgroundColor: batteryColor(m.battery) },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={[styles.batteryPct, { color: batteryColor(m.battery) }]}>
                        {m.battery != null ? `${m.battery}%` : '—'}
                      </Text>
                    </View>

                    {/* Botão desligar */}
                    <TouchableOpacity
                      style={[sharedStyles.redButton, styles.disconnectBtn]}
                      onPress={() => setModuleToRemove(m._id)}
                      activeOpacity={0.85}
                    >
                      <Text style={sharedStyles.redText}>Desligar</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Botão Conectar */}
          <TouchableOpacity
            style={sharedStyles.primaryButton}
            onPress={() => navigation.navigate('ConnectModule')}
            activeOpacity={0.85}
          >
            <Text style={sharedStyles.primaryButtonText}>+ Conectar Módulo</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Modal confirmar desligar */}
      <Modal
        visible={moduleToRemove !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModuleToRemove(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setModuleToRemove(null)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitle}>
              Tem a certeza que quer{'\n'}desligar o módulo?
            </Text>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.confirmButton]}
              onPress={confirmRemove}
              activeOpacity={0.85}
              disabled={removing}
            >
              {removing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={sharedStyles.confirmButtonText}>Sim, desligar!</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[sharedStyles.primaryButton, sharedStyles.cancelButton]}
              onPress={() => setModuleToRemove(null)}
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

  /* ── Loading ── */
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Scroll ── */
  scroll: {
    paddingBottom: 32,
    gap: 16,
  },

  /* ── Error ── */
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
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

  /* ── Module cards ── */
  moduleCards: {
    gap: 12,
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
    marginTop: 3,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: { backgroundColor: '#D1FAE5' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextOn: { color: colors.secondary },

  /* ── Battery ── */
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
  batteryBar: {
    height: 8,
    borderRadius: 4,
  },
  batteryPct: {
    fontSize: 13,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },

  /* ── Disconnect ── */
  disconnectBtn: {
    paddingVertical: 12,
    borderRadius: 18,
    marginHorizontal: 0,
    marginTop: 0,
  },

  /* ── Modal ── */
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
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 4,
  },
});