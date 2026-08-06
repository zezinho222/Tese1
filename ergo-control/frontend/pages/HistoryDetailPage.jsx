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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import syncService from '../syncService';
import { buildSessionCsv, buildSessionPdfHtml } from '../utils/exportUtils';
import { buildTimeAxisLabels } from '../utils/chartAxis';
import { formatGap, expandMissingIds } from '../utils/packetLoss';
import ChartTimeAxis from '../components/ChartTimeAxis';
import ExcelIcon from '../assets/excel.png';
import PdfIcon from '../assets/pdf.png';

const SENSOR_LABELS = { EMG: 'sEMG', IMU: 'IMU', DUAL: 'sEMG + IMU' };
const Y_AXIS_LABEL_WIDTH = 38;
const CHART_WIDTH = Dimensions.get('window').width - 20 * 2 - 16 * 2 - Y_AXIS_LABEL_WIDTH;

// Formatação de data e hora
function formatDateOnly(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(sec) {
  if (!sec) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export default function HistoryDetailPage({ navigation, route }) {
  const { token } = useAuth();
  const sessionId = route?.params?.sessionId;

  const [session, setSession]             = useState(null);
  const [sessionNumber, setSessionNumber] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [exportingCsv, setExportingCsv]   = useState(false);
  const [exportingPdf, setExportingPdf]   = useState(false);

  // Carrega a sessão do histórico (via syncService) e guarda no estado local
  // Se não encontrar, mostra erro
  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sessions = await syncService.getMergedSessions(token);
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
  const showEMG = session.sensorType === 'EMG' || session.sensorType === 'DUAL';
  const showIMU = session.sensorType === 'IMU' || session.sensorType === 'DUAL';


  // valores do gráfico em ecrã (downsampled -> porque sem isto ia desenhar todos os pontos e assim agregas apennas alguns)
  // usados só para desenhar a linha
  const emgData = Array.isArray(session.emgData) ? session.emgData : [];
  const imuData = Array.isArray(session.imuData) ? session.imuData : [];
  const emgChartData = syncService.downsampleArray(emgData);
  const imuChartData = syncService.downsampleArray(imuData);

  const packetStats  = session.packetStats || null;
  const packetGaps   = Array.isArray(packetStats?.gaps) ? packetStats.gaps : [];
  const missingIds   = expandMissingIds(packetGaps, 60);
  const hasLoss      = !!packetStats && packetStats.lost > 0;

  const showPacketEmg = packetStats ? (packetStats.hasEmg ?? showEMG) : false;
  const showPacketImu = packetStats ? (packetStats.hasImu ?? showIMU) : false;

  // envelope já vem calculado da sessão (1.0 = 100%), não
  // precisa de downsample porque já é bem mais pequeno do que o sinal em bruto
  const envelope = Array.isArray(session.envelope) ? session.envelope : [];
  const envelopeParams = session.envelopeParams || null;
  const envelopePeak = envelope.length ? Math.max(...envelope) : 0;
  const envelopeMean = envelope.length ? envelope.reduce((sum, v) => sum + v, 0) / envelope.length : 0;

  // Exportar CSV
  const handleExportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    setError('');
    try {
      const csv = buildSessionCsv({
        sessionNumber,
        sensorLabel,
        dateStr: formatDateOnly(session.startTime),
        timeStr: formatTime(session.startTime),
        durationSec: session.duration,
        alertCount: session.alertCount,
        mvc: session.mvc,
        emgData,
        imuData,
        envelope,
        envelopeParams,
        packetStats,
      });
      const fileUri = FileSystem.cacheDirectory + `sessao-${sessionNumber}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar CSV',
          UTI: 'public.comma-separated-values-text',
        });
      }
    } catch {
      setError('Erro ao exportar CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  // Exportar PDF
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    setError('');
    try {
      const html = buildSessionPdfHtml({
        sessionNumber,
        sensorLabel,
        dateStr: formatDateOnly(session.startTime),
        timeStr: formatTime(session.startTime),
        durationStr: formatDuration(session.duration),
        durationSec: session.duration,
        alertCount: session.alertCount,
        mvc: session.mvc,
        showEMG,
        showIMU,
        emgData,
        imuData,
        envelope,
        envelopeParams,
        packetStats,
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar PDF',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      setError('Erro ao exportar PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Gráfico sEMG 
  // Eixo x = tempo e eixo y = valores do sEMG.
  const renderEmgLine = () => {
    if (!emgChartData.length) {
      return (
        <View style={styles.graphEmptyReal}>
          <Text style={styles.noDataText}>Sem dados de gráfico guardados para esta sessão</Text>
        </View>
      );
    }
    return (
      <>
        <LineChart
          data={emgChartData.map((v) => ({ value: v }))}
          height={90}
          width={CHART_WIDTH}
          color={colors.text.yellow}
          thickness={2}
          curved
          hideDataPoints
          initialSpacing={4}
          endSpacing={4}
          disableScroll
          adjustToWidth
          noOfSections={3}
          yAxisTextStyle={styles.axisText}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          yAxisColor={colors.border}
          xAxisColor={colors.border}
          rulesColor={colors.border}
          rulesType="dashed"
        />
        <ChartTimeAxis
          labels={buildTimeAxisLabels(emgChartData.length, session.duration)}
          chartWidth={CHART_WIDTH}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          initialSpacing={4}
          endSpacing={4}
        />
      </>
    );
  };

  // Gráfico do Envelope RMS
  // Eixo x = tempo e eixo Y = % do MVC.
  const renderEnvelopeLine = () => {
    if (!envelope.length) {
      return (
        <View style={styles.graphEmptyReal}>
          <Text style={styles.noDataText}>Sem envelope guardado para esta sessão</Text>
        </View>
      );
    }
    return (
      <>
        <LineChart
          data={envelope.map((v) => ({ value: v * 100 }))}
          height={90}
          width={CHART_WIDTH}
          color={colors.purple}
          thickness={2}
          curved
          hideDataPoints
          initialSpacing={4}
          endSpacing={4}
          disableScroll
          adjustToWidth
          noOfSections={3}
          yAxisTextStyle={styles.axisText}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          yAxisColor={colors.border}
          xAxisColor={colors.border}
          rulesColor={colors.border}
          rulesType="dashed"
        />
        <ChartTimeAxis
          labels={buildTimeAxisLabels(envelope.length, session.duration)}
          chartWidth={CHART_WIDTH}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          initialSpacing={4}
          endSpacing={4}
        />
      </>
    );
  };

  // Gráfico IMU
  // Eixo x = tempo e eixo Y = valores do Pitch e Roll.
  const renderImuLine = () => {
    if (!imuData.length) {
      return (
        <View style={styles.graphEmptyReal}>
          <Text style={styles.noDataText}>Sem dados de gráfico guardados para esta sessão</Text>
        </View>
      );
    }
    const axisColors = [colors.primary, colors.secondary]; // Pitch, Roll
    return (
      <>
        <LineChart
          dataSet={axisColors.map((axisColor, i) => ({
            data: imuChartData.map((p) => ({ value: p?.[i] ?? 0 })),
            color: axisColor,
          }))}
          height={90}
          width={CHART_WIDTH}
          thickness={2}
          curved
          hideDataPoints
          initialSpacing={4}
          endSpacing={4}
          disableScroll
          adjustToWidth
          noOfSections={3}
          yAxisTextStyle={styles.axisText}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          yAxisColor={colors.border}
          xAxisColor={colors.border}
          rulesColor={colors.border}
          rulesType="dashed"
        />
        <ChartTimeAxis
          labels={buildTimeAxisLabels(imuChartData.length, session.duration)}
          chartWidth={CHART_WIDTH}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          initialSpacing={4}
          endSpacing={4}
        />
      </>
    );
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
        <Text style={styles.pageTitle}>Sessão #{sessionNumber}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/*  RESUMO  */}
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

        {/*Perda de Pacotes*/}
        <View style={[sharedStyles.card, styles.sectionCard]}>
          <Text style={styles.sectionLabel}>Perda de Pacotes</Text>

          {!packetStats ? (
            <Text style={styles.noDataText}>
              Sem contagem de pacotes para esta sessão.
            </Text>
          ) : (
            <>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Pacotes esperados</Text>
                  <Text style={styles.metaValue}>{packetStats.expected ?? 0}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Pacotes recebidos</Text>
                  <Text style={styles.metaValue}>{packetStats.received ?? 0}</Text>
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Pacotes perdidos</Text>
                  <Text style={[styles.metaValue, hasLoss && styles.lossValue]}>
                    {packetStats.lost ?? 0}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Taxa de perda</Text>
                  <Text style={[styles.metaValue, hasLoss && styles.lossValue]}>
                    {(packetStats.lossPct ?? 0).toFixed(2)}%
                  </Text>
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Intervalo de IDs</Text>
                  <Text style={styles.metaValue}>
                    {packetStats.firstSeq ?? '-'} {'->'} {packetStats.lastSeq ?? '-'}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Duplicados / fora de ordem</Text>
                  <Text style={styles.metaValue}>
                    {packetStats.duplicates ?? 0} / {packetStats.outOfOrder ?? 0}
                  </Text>
                </View>
              </View>

              {/* Amostras por sensor. Numa sessão só de IMU não aparece a
                  linha do sEMG, e vice-versa. */}
              {showPacketEmg && (
                <View style={styles.gridRow}>
                  <View style={styles.gridItem}>
                    <Text style={styles.metaLabel}>Amostras sEMG recebidas</Text>
                    <Text style={styles.metaValue}>{packetStats.emgSamplesReceived ?? 0}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.metaLabel}>Amostras sEMG perdidas</Text>
                    <Text style={[styles.metaValue, hasLoss && styles.lossValue]}>
                      {packetStats.emgSamplesLostEst ?? 0}
                    </Text>
                  </View>
                </View>
              )}

              {showPacketImu && (
                <View style={styles.gridRow}>
                  <View style={styles.gridItem}>
                    <Text style={styles.metaLabel}>Amostras IMU recebidas</Text>
                    <Text style={styles.metaValue}>{packetStats.imuSamplesReceived ?? 0}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.metaLabel}>Amostras IMU perdidas</Text>
                    <Text style={[styles.metaValue, hasLoss && styles.lossValue]}>
                      {packetStats.imuSamplesLostEst ?? 0}
                    </Text>
                  </View>
                </View>
              )}

              {/* IDs em falta */}
              {!hasLoss ? (
                <View style={styles.okBox}>
                  <Text style={styles.okText}>
                    Nenhum ID em falta - a sequência de pacotes está completa.
                  </Text>
                </View>
              ) : (
                <View style={styles.lossBox}>
                  <Text style={styles.lossBoxTitle}>
                    IDs em falta ({packetGaps.length} intervalo{packetGaps.length === 1 ? '' : 's'})
                  </Text>
                  <View style={styles.idChipRow}>
                    {packetGaps.slice(0, 30).map((g, i) => (
                      <View key={`${g.from}-${i}`} style={styles.idChip}>
                        <Text style={styles.idChipText}>{formatGap(g)}</Text>
                      </View>
                    ))}
                  </View>
                  {packetGaps.length > 30 && (
                    <Text style={styles.lossFootnote}>
                      ... e mais {packetGaps.length - 30} intervalo(s).
                    </Text>
                  )}
                  {missingIds.length > 0 && (
                    <Text style={styles.lossFootnote}>
                      Primeiros IDs perdidos: {missingIds.join(', ')}
                      {packetStats.lost > missingIds.length ? ' ...' : ''}
                    </Text>
                  )}
                  {packetStats.gapsTruncated && (
                    <Text style={styles.lossFootnote}>
                      A lista de falhas foi truncada (demasiadas perdas para registar todas).
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* sEMG - Resumo da Sessão */}
        {showEMG && (
          <View style={[sharedStyles.card, styles.sectionCard]}>
            <Text style={styles.graphTitle}>sEMG - Resumo da Sessão</Text>
            <View style={styles.graphAreaReal}>
              {renderEmgLine()}
            </View>
          </View>
        )}

        {/* Envelope RMS - Resumo da Sessão */}
        {showEMG && envelope.length > 0 && (
          <View style={[sharedStyles.card, styles.sectionCard]}>
            <Text style={styles.graphTitle}>Envelope RMS - Resumo da Sessão</Text>
            <View style={styles.graphAreaReal}>
              {renderEnvelopeLine()}
            </View>
            <View style={styles.gridRow}>
              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Janelas</Text>
                <Text style={styles.metaValue}>{envelope.length}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Pico</Text>
                <Text style={styles.metaValue}>{(envelopePeak * 100).toFixed(1)}% MVC</Text>
              </View>
            </View>
            <View style={styles.gridRow}>
              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Média</Text>
                <Text style={styles.metaValue}>{(envelopeMean * 100).toFixed(1)}% MVC</Text>
              </View>
              {envelopeParams && (
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Janela / Salto</Text>
                  <Text style={styles.metaValue}>{envelopeParams.windowMs}ms / {envelopeParams.overlapMs}ms</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* IMU - Resumo da Sessão */}
        {showIMU && (
          <View style={[sharedStyles.card, styles.sectionCard]}>
            <Text style={styles.graphTitle}>IMU - Resumo da Sessão</Text>
            <View style={styles.graphAreaReal}>
              {renderImuLine()}
            </View>
            {imuData.length > 0 && (
              <View style={styles.imuLegendRow}>
                {['Pitch', 'Roll'].map((label, i) => (
                  <View key={label} style={styles.imuLegendItem}>
                    <View style={[styles.imuLegendDot, { backgroundColor: [colors.primary, colors.secondary][i] }]} />
                    <Text style={styles.imuLegendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Exportar Dados */}
        <Text style={styles.sectionTitle}>Exportar Dados</Text>

        <View style={styles.exportGroup}>
          {/* Exportar CSV */}
          <TouchableOpacity
            style={[sharedStyles.card, styles.exportCard]}
            activeOpacity={0.82}
            onPress={handleExportCsv}
            disabled={exportingCsv}
          >
            <View style={[styles.exportIconCircle, styles.exportIconGreen]}>
              <Image source={ExcelIcon} style={styles.exportIconImage} />
            </View>
            <View style={styles.exportText}>
              <Text style={styles.exportTitle}>Exportar CSV</Text>
              <Text style={styles.exportSubtitle}>Dados Brutos</Text>
            </View>
            {exportingCsv
              ? <ActivityIndicator color={colors.text.secondary} />
              : <Text style={sharedStyles.menuArrow}>›</Text>
            }
          </TouchableOpacity>

          {/* Exportar PDF */}
          <TouchableOpacity
            style={[sharedStyles.card, styles.exportCard]}
            activeOpacity={0.82}
            onPress={handleExportPdf}
            disabled={exportingPdf}
          >
            <View style={[styles.exportIconCircle, styles.exportIconRed]}>
              <Image source={PdfIcon} style={styles.exportIconImage} />
            </View>
            <View style={styles.exportText}>
              <Text style={styles.exportTitle}>Exportar PDF</Text>
              <Text style={styles.exportSubtitle}>Relatório completo com gráficos</Text>
            </View>
            {exportingPdf
              ? <ActivityIndicator color={colors.text.secondary} />
              : <Text style={sharedStyles.menuArrow}>›</Text>
            }
          </TouchableOpacity>
        </View>

        {error !== '' && (
          <View style={[sharedStyles.helperBox, styles.errorBox]}>
            <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
          </View>
        )}
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
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
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
  lossValue: {
    color: colors.text.red,
  },
  okBox: {
    backgroundColor: colors.success,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  okText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  lossBox: {
    backgroundColor: colors.redBackground,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    gap: 6,
  },
  lossBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.red,
  },
  idChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  idChip: {
    backgroundColor: colors.white,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.text.red + '30',
  },
  idChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.red,
  },
  lossFootnote: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  graphTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  graphAreaReal: {
    minHeight: 90,
    paddingVertical: 6,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  graphEmptyReal: {
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  noDataText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  axisText: {
    fontSize: 9,
    color: colors.text.secondary,
  },
  imuLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 4,
  },
  imuLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  imuLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  imuLegendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
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
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },
});