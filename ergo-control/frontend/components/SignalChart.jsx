import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';

// Percorre todas as amostras e devolve [min, max] por coluna de píxeis
function buildMinMaxColumns(data, columns) {
  const n = data.length;
  const result = new Array(columns).fill(null);

  for (let c = 0; c < columns; c++) {
    const start = Math.floor((c * n) / columns);
    let end = Math.floor(((c + 1) * n) / columns);
    if (end <= start) end = start + 1;

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i < end && i < n; i++) {
      const v = data[i];
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo !== Infinity) result[c] = [lo, hi];
  }
  return result;
}

export default function SignalChart({
  series,                 // [{ data: number[], color: string }]
  width,
  height,
  minValue,               // se omitido, é inferido dos dados
  maxValue,
  showAxis = true,
  noOfSections = 4,
  yAxisLabels,            // rótulos explícitos, de cima para baixo (opcional)
  yAxisLabelWidth = 50,
  axisColor = '#E5E7EB',
  rulesColor = '#E5E7EB',
  axisTextStyle,
  strokeWidth = 1,
}) {
  const plotWidth = Math.max(width - (showAxis ? yAxisLabelWidth : 0), 1);
  const columns = Math.max(Math.floor(plotWidth), 1);

  // Limites do eixo Y
  const { min, max } = useMemo(() => {
    if (minValue !== undefined && maxValue !== undefined) {
      return { min: minValue, max: maxValue };
    }
    let lo = Infinity;
    let hi = -Infinity;
    series.forEach((s) => {
      for (let i = 0; i < s.data.length; i++) {
        const v = s.data[i];
        if (typeof v !== 'number' || Number.isNaN(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1 };
    if (lo === hi) return { min: lo - 1, max: hi + 1 };
    const pad = (hi - lo) * 0.1;
    return { min: lo - pad, max: hi + pad };
  }, [series, minValue, maxValue]);

  const range = max - min || 1;

  // Converte um valor do sinal numa coordenada Y, limitada à área útil
  const toY = (v) => {
    const norm = Math.min(Math.max((v - min) / range, 0), 1);
    return height - norm * height;
  };

  const paths = useMemo(
    () => series.map((s) => {
      const data = Array.isArray(s.data) ? s.data : [];
      if (data.length === 0) return { color: s.color, d: '' };

      // Menos amostras do que colunas: linha normal, sem agregação
      if (data.length <= columns) {
        const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;
        let d = '';
        data.forEach((v, i) => {
          const x = (i * stepX).toFixed(2);
          const y = toY(v).toFixed(2);
          d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
        });
        return { color: s.color, d };
      }

      // Agregação min/max: uma barra vertical por coluna de píxeis
      const cols = buildMinMaxColumns(data, columns);
      const colWidth = plotWidth / columns;
      let d = '';
      cols.forEach((col, c) => {
        if (!col) return;
        const x = (c * colWidth + colWidth / 2).toFixed(2);
        const yHi = toY(col[1]).toFixed(2);
        const yLo = toY(col[0]).toFixed(2);
        d += `M${x},${yHi}L${x},${yLo}`;
      });
      return { color: s.color, d };
    }),
    [series, columns, plotWidth, height, min, range]
  );

  const totalSections = Math.max(noOfSections, 1);
  const sectionIndexes = showAxis
    ? Array.from({ length: totalSections + 1 }, (_, i) => i)
    : [];

  return (
    <View style={styles.row}>
      {showAxis && (
        <View style={[styles.axisColumn, { width: yAxisLabelWidth, height }]}>
          {sectionIndexes.map((i) => {
            const label = yAxisLabels
              ? yAxisLabels[i]
              : Math.round(max - (i / totalSections) * range);
            return (
              <Text key={i} style={[styles.axisText, axisTextStyle]} numberOfLines={1}>
                {label}
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
        {paths.map((p, idx) =>
          p.d ? (
            <Path
              key={idx}
              d={p.d}
              stroke={p.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
            />
          ) : null
        )}
      </Svg>
    </View>
  );
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