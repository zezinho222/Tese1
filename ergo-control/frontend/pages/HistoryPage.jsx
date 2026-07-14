import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import syncService from '../syncService';

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };
const SENSOR_ICONS  = { EMG: '⚡', IMU: '🧭', DUAL: '⚡🧭' };

function formatDuration(sec) {
  if (!sec) return '0m 00s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return `Hoje, ${timeStr}`;
  if (diffDays === 1) return `Ontem, ${timeStr}`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) + `, ${timeStr}`;
}

export default function HistoryPage({ navigation }) {
  const { token } = useAuth();

  const [sessions,   setSessions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  // ── Carregar sessões (local + merge com backend quando há internet) ───────
  const loadSessions = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const merged = await syncService.getMergedSessions(token);
      setSessions(merged);
    } catch {
      setError('Erro ao carregar sessões.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadSessions(); }, []));

  // ── Sessões recentes (últimas 5) ───────────────────────────────────────────
  const recentSessions = sessions.slice(0, 5);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Histórico</Text>
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
              onRefresh={() => loadSessions(true)}
              tintColor={colors.primary}
            />
          }
        >
          {error !== '' && (
            <View style={[sharedStyles.helperBox, styles.errorBox]}>
              <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Sessões Recentes</Text>

          {recentSessions.length === 0 && error === '' ? (
            <View style={[sharedStyles.card, styles.emptyCard]}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Sem sessões registadas</Text>
              <Text style={styles.emptySubtitle}>
                As tuas sessões de monitorização aparecerão aqui.
              </Text>
            </View>
          ) : (
            recentSessions.map((session, index) => {
              const sensorLabel = SENSOR_LABELS[session.sensorType] || session.sensorType;
              const sensorIcon  = SENSOR_ICONS[session.sensorType]  || '📡';
              return (
                <View key={session.localId} style={[sharedStyles.card, styles.sessionCard]}>
                  {/* Cabeçalho */}
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleRow}>
                      <Text style={styles.sessionIcon}>{sensorIcon}</Text>
                      <View>
                        <Text style={styles.sessionTitle}>
                          Sessão #{sessions.length - index}
                        </Text>
                        <Text style={styles.sensorBadge}>{sensorLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.sessionDate}>{formatDate(session.startTime)}</Text>
                  </View>

                  {session.synced === false && (
                    <View style={styles.syncBadge}>
                      <Text style={styles.syncBadgeText}>⏳ Por sincronizar com o servidor </Text>
                    </View>
                  )}

                  {session.synced === false && (
                    <View style={styles.syncBadge}>
                      <Text style={styles.syncBadgeText}>📡 Ligue-se a uma rede Wi-Fi com internet para sincronizar</Text>
                    </View>
                  )}

                  {/* Estatísticas */}
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{formatDuration(session.duration)}</Text>
                      <Text style={styles.statLabel}>Duração</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{session.alertCount ?? 0}</Text>
                      <Text style={styles.statLabel}>Alertas</Text>
                    </View>
                    {session.mvc != null && (
                      <>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{session.mvc.toFixed(2)}</Text>
                          <Text style={styles.statLabel}>MVC</Text>
                        </View>
                      </>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.detailsBtn}
                    onPress={() => navigation.navigate('HistoryDetail', { sessionId: session.localId })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.detailsBtnText}>Ver detalhes ›</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Botão ver todas ── 
      {!loading && sessions.length > 0 && (
        <View style={styles.bottomWrap}>
          <TouchableOpacity
            style={styles.allSessionsBtn}
            onPress={() => navigation.navigate('AllSessions')}
            activeOpacity={0.85}
          >
            <Text style={styles.allSessionsBtnText}>Ver Todas as Sessões</Text>
            <Text style={styles.allSessionsArrow}>›</Text>
          </TouchableOpacity>
        </View>
      )}*/}
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

  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: -4,
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

  /* ── Estado vazio ── */
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

  /* ── Cartão de sessão ── */
  sessionCard: {
    backgroundColor: colors.white,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionIcon: {
    fontSize: 22,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sensorBadge: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },

  /* ── Estado de sincronização ── */
  syncBadge: {
    backgroundColor: colors.text.yellow + '20',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.yellow,
  },

  /* ── Estatísticas ── */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 18,
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
    height: 32,
    backgroundColor: colors.border,
  },

  detailsBtn: {
    alignSelf: 'flex-end',
  },
  detailsBtnText: {
    fontSize: 13,
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
  allSessionsBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  allSessionsBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
    textAlign: 'center',
  },
  allSessionsArrow: {
    fontSize: 36,
    fontWeight: '400',
    color: colors.white,
    position: 'absolute',
    right: 16,
    lineHeight: 36,
  },
});