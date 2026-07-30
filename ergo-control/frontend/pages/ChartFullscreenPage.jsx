import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { colors } from '../utils/shared-Styles';
import moduleService from '../moduleService';

const DISPLAY_POINTS = 40;
const REFRESH_MS     = 1000;
const Y_AXIS_LABEL_WIDTH = 42;
const IMU_Y_AXIS_MAX = 100; // eixo Y do gráfico IMU fixo em [-100, 100]

// Fora do componente — senão seria recriado (nova referência) em cada render
// e o LineChart reage a mudanças de referência no dataSet mesmo com valores iguais.
const IMU_AXIS_COLORS = [colors.primary, colors.secondary]; // Pitch, Roll

export default function ChartFullscreenPage({ navigation, route }) {
  const { type } = route.params; // 'EMG' | 'IMU'
  const { width, height } = useWindowDimensions();

  const [emgPoints, setEmgPoints] = useState([]);
  const [imuPoints, setImuPoints] = useState([]);
  const intervalRef = useRef(null);

  // ── Força o ecrã em modo horizontal enquanto esta página está aberta ──────
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // ── Atualização periódica dos dados — lê diretamente do moduleService ─────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const { emgBuffer, imuBuffer } = moduleService.getRecentBuffers(DISPLAY_POINTS);
      setEmgPoints(emgBuffer);
      setImuPoints(imuBuffer);
    }, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  const chartWidth  = Math.max(width - 48 - Y_AXIS_LABEL_WIDTH, 160);
  const chartHeight = Math.max(height - 160, 120);

  const emgChartData = useMemo(
    () => emgPoints.map((v) => ({ value: v })),
    [emgPoints]
  );
  // Usamos `data`/`data2` (linhas individuais) em vez de `dataSet`: o efeito
  // interno do react-native-gifted-charts que recalcula o traçado SVG só
  // depende de `data`/`data2`/..., nunca de `dataSet` — por isso um gráfico
  // multi-linha construído com `dataSet` fica com as linhas presas no
  // primeiro desenho, apesar dos dados continuarem a mudar por baixo.
  const imuPitchData = useMemo(
    () => imuPoints.map((p) => ({ value: p?.[0] ?? 0 })),
    [imuPoints]
  );
  const imuRollData = useMemo(
    () => imuPoints.map((p) => ({ value: p?.[1] ?? 0 })),
    [imuPoints]
  );

  const renderEmgChart = () => {
    if (!emgPoints.length) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados — Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <LineChart
        data={emgChartData}
        height={chartHeight}
        width={chartWidth}
        color={colors.text.yellow}
        thickness={2}
        curved
        hideDataPoints
        initialSpacing={4}
        endSpacing={4}
        disableScroll
        adjustToWidth
        noOfSections={4}
        yAxisTextStyle={styles.axisText}
        yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
        rulesColor={colors.border}
        rulesType="dashed"
      />
    );
  };

  const renderImuChart = () => {
    if (!imuPoints.length) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados — Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <LineChart
        data={imuPitchData}
        data2={imuRollData}
        color={IMU_AXIS_COLORS[0]}
        color2={IMU_AXIS_COLORS[1]}
        height={chartHeight}
        width={chartWidth}
        thickness={2}
        curved
        hideDataPoints
        initialSpacing={4}
        endSpacing={4}
        disableScroll
        adjustToWidth
        noOfSections={4}
        noOfSectionsBelowXAxis={4}
        maxValue={IMU_Y_AXIS_MAX}
        mostNegativeValue={-IMU_Y_AXIS_MAX}
        yAxisTextStyle={styles.axisText}
        yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
        rulesColor={colors.border}
        rulesType="dashed"
      />
    );
  };

  const title = type === 'EMG' ? '⚡ sEMG — Atividade Muscular' : '🧭 IMU — Dados de Movimento';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.chartWrap}>
        {type === 'EMG' ? renderEmgChart() : renderImuChart()}
      </View>

      {type === 'IMU' && imuPoints.length > 0 && (
        <View style={styles.legendRow}>
          {['Pitch', 'Roll'].map((label, i) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: IMU_AXIS_COLORS[i] }]} />
              <Text style={styles.legendLabel}>{label}</Text>
              <Text style={styles.legendValue}>
                {(imuPoints[imuPoints.length - 1]?.[i] ?? 0).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 42,
  },

  /* ── Gráfico ── */
  chartWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  graphEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  axisText: {
    fontSize: 9,
    color: colors.text.secondary,
  },

  /* ── Legenda (IMU) ── */
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
});