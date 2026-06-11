import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import ExcelIcon from '../assets/excel.png';
import PdfIcon from '../assets/pdf.png';

// Dados mock — substituir por dados reais via props/route
const mockSession = {
  id: 47,
  date: '11 Mar 2026',
  start: '08:30',
  duration: '1h 12m',
  modules: 'sEMG, IMU',
  alerts: 3,
};

export default function HistoryDetailPage({ navigation, route }) {
  const sessionId = route?.params?.sessionId ?? mockSession.id;
  const session = mockSession; // trocar por fetch real se necessário

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
        <Text style={styles.pageTitle}>Sessão #{sessionId}</Text>
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
              <Text style={styles.metaValue}>{session.date}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Início</Text>
              <Text style={styles.metaValue}>{session.start}</Text>
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Duração</Text>
              <Text style={styles.metaValue}>{session.duration}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Módulos</Text>
              <Text style={styles.metaValue}>{session.modules}</Text>
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Alertas</Text>
              <Text style={styles.metaValue}>{session.alerts}</Text>
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