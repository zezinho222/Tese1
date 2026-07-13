import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import syncService from '../syncService';
import ExcelIcon from '../assets/excel.png';
import PdfIcon from '../assets/pdf.png';

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };

function formatDateOnly(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(sec) {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

export default function HistoryDetailPage({ navigation, route }) {
  const { token } = useAuth();
  const sessionId = route?.params?.sessionId;

  const [session, setSession]             = useState(null);
  const [sessionNumber, setSessionNumber] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sessions = await syncService.getMergedSessions(token); // ordenadas da mais recente para a mais antiga
      const idx = sessions.findIndex((s) => s.localId === sessionId);
      if (idx === -1) {
        setError('Sessão não encontrada.');
        setSession(null);
      } else {
        setSession(sessions[idx]);
        setSessionNumber(sessions.length - idx);
      }
    } catch {
      setError('Erro ao carregar a sessão.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useFocusEffect(useCallback(() => { loadSession(); }, [loadSession]));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Sessão</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingWrap}>
          <Text style={styles.metaLabel}>{error || 'Sessão não encontrada.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sensorLabel = SENSOR_LABELS[session.sensorType] || session.sensorType;

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
        <Text style={styles.pageTitle}>Sessão #{sessionNumber}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── RESUMO ── */}
        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.sectionLabel}>RESUMO</Text>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Data</Text>
              <Text style={styles.metaValue}>{formatDateOnly(session.startTime)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Início</Text>
              <Text style={styles.metaValue}>{formatTime(session.startTime)}</Text>
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Duração</Text>
              <Text style={styles.metaValue}>{formatDuration(session.duration)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Módulos</Text>
              <Text style={styles.metaValue}>{sensorLabel}</Text>
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Alertas</Text>
              <Text style={styles.metaValue}>{session.alertCount ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* ── sEMG - Resumo da Sessão ── */}
        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.graphTitle}>sEMG - Resumo da Sessão</Text>
          <View style={styles.graphArea}>
            <View style={styles.graphLinesWrap}>
              {[...Array(3)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.graphLine,
                    {
                      opacity: 0.4 + i * 0.25,
                      marginTop: i * 6,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ── IMU - Resumo da Sessão ── */}
        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.graphTitle}>IMU - Resumo da Sessão</Text>
          <View style={styles.graphArea}>
            <View style={styles.graphLinesWrap}>
              {[...Array(3)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.graphLine,
                    {
                      opacity: 0.3 + i * 0.3,
                      marginTop: i * 6,
                      backgroundColor: colors.secondary,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ── Exportar Dados ── */}
        <Text style={styles.sectionTitle}>Exportar Dados</Text>

        <View style={styles.exportGroup}>
          {/* Exportar CSV */}
          <TouchableOpacity
            style={[sharedStyles.card, styles.exportCard]}
            activeOpacity={0.82}
          >
            <View style={[styles.exportIconCircle, styles.exportIconGreen]}>
              <Image source={ExcelIcon} style={styles.exportIconImage} />
            </View>
            <View style={styles.exportText}>
              <Text style={styles.exportTitle}>Exportar CSV</Text>
              <Text style={styles.exportSubtitle}>Dados Brutos</Text>
            </View>
            <Text style={sharedStyles.menuArrow}>›</Text>
          </TouchableOpacity>

          {/* Exportar PDF */}
          <TouchableOpacity
            style={[sharedStyles.card, styles.exportCard]}
            activeOpacity={0.82}
          >
            <View style={[styles.exportIconCircle, styles.exportIconRed]}>
              <Image source={PdfIcon} style={styles.exportIconImage} />
            </View>
            <View style={styles.exportText}>
              <Text style={styles.exportTitle}>Exportar PDF</Text>
              <Text style={styles.exportSubtitle}>Relatório completo com gráficos</Text>
            </View>
            <Text style={sharedStyles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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
  headerSpacer: {
    width: 50,
  },

  /* ── Scroll ── */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 14,
  },

  /* ── Generic section card ── */
  sectionCard: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },

  /* ── RESUMO ── */
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 24,
  },
  gridItem: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },

  /* ── Graph cards ── */
  graphTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
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
  graphLinesWrap: {
    width: '100%',
    gap: 4,
    paddingTop: 12,
  },
  graphLine: {
    height: 2,
    width: '100%',
    borderRadius: 2,
  },

  /* ── Export section ── */
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  exportGroup: {
    gap: 12,
  },
  exportCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    borderWidth: 1,
  },
  exportIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    marginRight: 14,
  },
  exportIconGreen: {
    backgroundColor: '#D1FAE5',
  },
  exportIconRed: {
    backgroundColor: colors.redBackground,
  },
  exportIconImage: {
    width: 26,
    height: 26,
    resizeMode: 'contain',
  },
  exportText: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  exportSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});