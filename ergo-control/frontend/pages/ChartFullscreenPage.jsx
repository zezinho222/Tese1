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
import LiveLineChart from '../components/LiveLineChart';
import { colors } from '../utils/shared-Styles';
import moduleService from '../moduleService';


const DISPLAY_POINTS = 40; // número de pontos que mostra no gráfico 
const REFRESH_MS     = 1000; // intervalo de atualização do gráfico (ms)
const Y_AXIS_LABEL_WIDTH = 42; // largura do eixo Y do gráfico 
const IMU_Y_AXIS_MAX = 100; // eixo Y do gráfico IMU fixo em [-100, 100]

const IMU_AXIS_COLORS = [colors.primary, colors.secondary]; // Pitch, Roll

// Página de visualização do gráfico em fullscreen
export default function ChartFullscreenPage({ navigation, route }) {
  const { type } = route.params; // 'EMG' | 'IMU'
  const { width, height } = useWindowDimensions();

  const [emgPoints, setEmgPoints] = useState([]);
  const [imuPoints, setImuPoints] = useState([]);
  const intervalRef = useRef(null);

  // Força o ecrã em modo horizontal
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // Atualização periódica dos dados
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

  const renderEmgChart = () => {
    if (!emgPoints.length) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados - Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <LiveLineChart
        series={emgSeries}
        width={chartWidth}
        height={chartHeight}
        showAxis
        noOfSections={4}
        axisTextStyle={styles.axisText}
        yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
        axisColor={colors.border}
        rulesColor={colors.border}
      />
    );
  };

  const renderImuChart = () => {
    if (!imuPoints.length) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados - Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <LiveLineChart
        series={imuSeries}
        width={chartWidth}
        height={chartHeight}
        showAxis
        noOfSections={4}
        noOfSectionsBelowZero={4}
        minValue={-IMU_Y_AXIS_MAX}
        maxValue={IMU_Y_AXIS_MAX}
        axisTextStyle={styles.axisText}
        yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
        axisColor={colors.border}
        rulesColor={colors.border}
      />
    );
  };

  const title = type === 'EMG' ? '⚡ sEMG - Atividade Muscular' : '🧭 IMU - Dados de Movimento';

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
