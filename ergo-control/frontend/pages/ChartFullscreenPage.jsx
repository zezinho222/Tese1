import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import SignalChart from '../components/SignalChart';
import ChartTimeAxis from '../components/ChartTimeAxis';
import { colors } from '../utils/shared-Styles';
import moduleService from '../moduleService';
import { ADC_VREF, adcArrayToVolts } from '../utils/emgProcessing';

/* Janela de visualização, em segundos. Ao contrário do gráfico do ecrã
   principal - que mostra um nº fixo de pontos - aqui a janela é definida em
   TEMPO: o nº de amostras apresentadas é fs x WINDOW_SEC, pelo que o eixo x
   representa segundos reais e a janela tem sempre a mesma duração,
   independentemente da frequência de amostragem escolhida. */
const WINDOW_SEC = 5;

// Intervalo de redesenho do gráfico. 100 ms (10 fps) dá uma leitura fluida sem
// sobrecarregar dispositivos mais antigos; baixar para 50 ms torna-a mais suave.
const REFRESH_MS = 100;

/* O IMU é amostrado a ~100 Hz pelo firmware, de forma independente do comando
   FREQ que define a frequência do sEMG. Por isso tem a sua própria base de
   tempo e um nº de amostras por janela diferente. */
const FS_IMU_HZ = 100;

// Usado apenas se a página for aberta sem a frequência do módulo nos parâmetros
const FS_EMG_FALLBACK_HZ = 2000;

const Y_AXIS_LABEL_WIDTH = 50;

// Eixo Y do sEMG fixo na gama completa do ADC, expressa em volts (0 a 3.3 V)
const EMG_Y_AXIS_MIN = 0;
const EMG_Y_AXIS_MAX = ADC_VREF;
const EMG_Y_SECTIONS = 4;
const EMG_Y_AXIS_LABELS = Array.from(
  { length: EMG_Y_SECTIONS + 1 },
  (_, i) => `${(EMG_Y_AXIS_MAX - (EMG_Y_AXIS_MAX * i) / EMG_Y_SECTIONS).toFixed(2)} V`
);

// Eixo Y do IMU fixo em [-100, 100] graus
const IMU_Y_AXIS_MAX = 100;
const IMU_Y_SECTIONS = 8;
const IMU_Y_AXIS_LABELS = Array.from(
  { length: IMU_Y_SECTIONS + 1 },
  (_, i) => `${Math.round(IMU_Y_AXIS_MAX - (2 * IMU_Y_AXIS_MAX * i) / IMU_Y_SECTIONS)}°`
);

const IMU_AXIS_COLORS = [colors.primary, colors.secondary]; // Pitch, Roll

/* Rótulos do eixo do tempo da janela visível. O nº de amostras apresentadas
   cresce até encher a janela, por isso a duração real do que está no ecrã é
   (N-1)/fs e não WINDOW_SEC enquanto a aquisição está a arrancar. */
function buildWindowLabels(spanSec, ticks = 6) {
  const labels = [];
  for (let i = 0; i < ticks; i++) {
    const t = (spanSec * i) / (ticks - 1);
    labels.push(spanSec >= 10 ? `${Math.round(t)}s` : `${t.toFixed(1)}s`);
  }
  return labels;
}

// Página de visualização do gráfico em fullscreen
export default function ChartFullscreenPage({ navigation, route }) {
  const { type, fsEmg } = route.params; // 'EMG' | 'IMU'
  const { width, height } = useWindowDimensions();

  const fsEmgHz = fsEmg > 0 ? fsEmg : FS_EMG_FALLBACK_HZ;

  // Nº máximo de amostras por janela, calculado a partir da frequência de cada sensor
  const maxSamplesEmg = Math.max(1, Math.round(fsEmgHz * WINDOW_SEC));
  const maxSamplesImu = Math.max(1, Math.round(FS_IMU_HZ * WINDOW_SEC));

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
      const { emgBuffer, imuBuffer } = moduleService.getRecentBuffers({
        emg: maxSamplesEmg,
        imu: maxSamplesImu,
      });
      setEmgPoints(emgBuffer);
      setImuPoints(imuBuffer);
    }, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [maxSamplesEmg, maxSamplesImu]);

  const plotWidth   = Math.max(width - 48 - Y_AXIS_LABEL_WIDTH, 160);
  const chartHeight = Math.max(height - 190, 120);

  // As amostras chegam em bruto do ADC; o gráfico apresenta-as sempre em volts
  const emgSeries = useMemo(
    () => [{ data: adcArrayToVolts(emgPoints), color: colors.text.yellow }],
    [emgPoints]
  );
  const imuSeries = useMemo(
    () => IMU_AXIS_COLORS.map((axisColor, i) => ({
      data: imuPoints.map((p) => p?.[i] ?? 0),
      color: axisColor,
    })),
    [imuPoints]
  );

  // Duração real do que está visível, para o eixo do tempo
  const emgSpanSec = emgPoints.length > 1 ? (emgPoints.length - 1) / fsEmgHz : 0;
  const imuSpanSec = imuPoints.length > 1 ? (imuPoints.length - 1) / FS_IMU_HZ : 0;

  const renderEmgChart = () => {
    if (!emgPoints.length) {
      return (
        <View style={styles.graphEmpty}>
          <Text style={styles.noDataText}>Sem dados - Inicia a monitorização</Text>
        </View>
      );
    }
    return (
      <>
        <SignalChart
          series={emgSeries}
          width={plotWidth + Y_AXIS_LABEL_WIDTH}
          height={chartHeight}
          minValue={EMG_Y_AXIS_MIN}
          maxValue={EMG_Y_AXIS_MAX}
          noOfSections={EMG_Y_SECTIONS}
          yAxisLabels={EMG_Y_AXIS_LABELS}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          axisColor={colors.border}
          rulesColor={colors.border}
          axisTextStyle={styles.axisText}
        />
        <ChartTimeAxis
          labels={buildWindowLabels(emgSpanSec)}
          chartWidth={plotWidth}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          initialSpacing={0}
          endSpacing={0}
        />
      </>
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
      <>
        <SignalChart
          series={imuSeries}
          width={plotWidth + Y_AXIS_LABEL_WIDTH}
          height={chartHeight}
          minValue={-IMU_Y_AXIS_MAX}
          maxValue={IMU_Y_AXIS_MAX}
          noOfSections={IMU_Y_SECTIONS}
          yAxisLabels={IMU_Y_AXIS_LABELS}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          axisColor={colors.border}
          rulesColor={colors.border}
          axisTextStyle={styles.axisText}
          strokeWidth={2}
        />
        <ChartTimeAxis
          labels={buildWindowLabels(imuSpanSec)}
          chartWidth={plotWidth}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          initialSpacing={0}
          endSpacing={0}
        />
        <Text style={styles.windowInfo}>
          Janela {WINDOW_SEC}s • fs {FS_IMU_HZ} Hz • {imuPoints.length} amostras
        </Text>
      </>
    );
  };

  const title = type === 'EMG' ? '⚡ sEMG - Atividade Muscular (V)' : '🧭 IMU - Dados de Movimento';

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
    paddingTop: 4,
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
  windowInfo: {
    marginTop: 6,
    fontSize: 10,
    color: colors.text.secondary,
    textAlign: 'center',
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