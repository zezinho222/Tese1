import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';

/**
 * Gráfico de linha simples e sem estado interno, para dados que mudam em
 * tempo real (ex: EMG/IMU durante a monitorização).
 *
 * Foi criado para substituir o LineChart do react-native-gifted-charts
 * nesse cenário: a biblioteca acumula estado interno a cada atualização de
 * `data`/`dataSet` e, ao fim de algum tempo de monitorização contínua
 * (~1 min a 1 atualização/seg), rebenta com "Maximum update depth
 * exceeded" — já tinha acontecido antes a 300ms (ver monitoringService.js)
 * e voltou a acontecer mesmo a 1seg/atualização. Este componente deriva o
 * traçado inteiramente das props em cada render (sem useEffect/useState
 * interno a sincronizar dados), pelo que não há estado a acumular.
 */
export default function LiveLineChart({
  series,
  width,
  height,
  minValue,
  maxValue,
  showAxis = false,
  noOfSections = 4,
  noOfSectionsBelowZero = 0,
  axisColor = '#ccc',
  rulesColor = '#ccc',
  axisTextStyle,
  yAxisLabelWidth = 0,
}) {
  const plotWidth = Math.max(width - (showAxis ? yAxisLabelWidth : 0), 1);

  const { min, max } = useMemo(() => {
    if (minValue !== undefined && maxValue !== undefined) {
      return { min: minValue, max: maxValue };
    }
    let lo = Infinity;
    let hi = -Infinity;
    series.forEach((s) => {
      s.data.forEach((v) => {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const padding = (hi - lo) * 0.1;
    return { min: lo - padding, max: hi + padding };
  }, [series, minValue, maxValue]);

  const range = max - min || 1;

  const paths = useMemo(
    () => series.map((s) => ({
      color: s.color,
      d: buildSmoothPath(s.data, plotWidth, height, min, range),
    })),
    [series, plotWidth, height, min, range]
  );

  const totalSections = Math.max(noOfSections + noOfSectionsBelowZero, 1);
  const sectionIndexes = showAxis
    ? Array.from({ length: totalSections + 1 }, (_, i) => i)
    : [];

  return (
    <View style={styles.row}>
      {showAxis && (
        <View style={[styles.axisColumn, { width: yAxisLabelWidth, height }]}>
          {sectionIndexes.map((i) => {
            const value = max - (i / totalSections) * range;
            return (
              <Text key={i} style={[styles.axisText, axisTextStyle]} numberOfLines={1}>
                {Math.round(value)}
              </Text>
            );
          })}
        </View>
      )}
      <Svg width={plotWidth} height={height}>
        {sectionIndexes.map((i) => {
          const y = (i / totalSections) * height;
          const isEdge = i === 0 || i === totalSections;
          return (
            <Line
              key={i}
              x1={0}
              y1={y}
              x2={plotWidth}
              y2={y}
              stroke={isEdge ? axisColor : rulesColor}
              strokeWidth={1}
              strokeDasharray={isEdge ? undefined : '4,4'}
            />
          );
        })}
        {paths.map((p, idx) => (
          <Path key={idx} d={p.d} stroke={p.color} strokeWidth={2} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function buildSmoothPath(data, width, height, min, range) {
  const n = data.length;
  if (n === 0) return '';
  const stepX = n > 1 ? width / (n - 1) : 0;
  const points = data.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * height,
  ]);

  if (points.length === 1) {
    const [x, y] = points[0];
    return `M${x},${y} L${x},${y}`;
  }

  // Suavização por ponto médio: uma curva quadrática entre cada par de
  // pontos, sem depender de nenhuma biblioteca externa de bezier.
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d += ` Q${x0},${y0} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  axisColumn: {
    justifyContent: 'space-between',
  },
  axisText: {
    fontSize: 9,
    textAlign: 'right',
  },
});
