import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../utils/shared-Styles';

/**
 * Etiquetas do eixo X (tempo) desenhadas por baixo de um LineChart do
 * react-native-gifted-charts.
 *
 * A versão instalada da biblioteca não implementa `xAxisLabelTexts` para
 * gráficos de linha (só para barras/bubble) — passar essa prop não faz
 * nada. Por isso desenhamos a nossa própria fila de texto, posicionada com
 * os mesmos cálculos de espaçamento que o gráfico usa internamente
 * (initialSpacing/endSpacing + distribuição uniforme dos pontos), para as
 * etiquetas ficarem alinhadas com os pontos certos.
 */
export default function ChartTimeAxis({
  labels,
  chartWidth,
  yAxisLabelWidth = 0,
  initialSpacing = 4,
  endSpacing = 4,
  labelWidth = 32,
}) {
  const n = labels?.length ?? 0;
  if (n === 0) return null;

  const plotWidth = Math.max(chartWidth - initialSpacing - endSpacing, 0);
  const xStep = n > 1 ? plotWidth / (n - 1) : 0;

  return (
    <View style={[styles.row, { marginLeft: yAxisLabelWidth, width: chartWidth }]}>
      {labels.map((label, i) => {
        if (!label) return null;
        const x = initialSpacing + i * xStep;
        return (
          <Text
            key={i}
            style={[styles.text, { left: x - labelWidth / 2, width: labelWidth }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 14,
    position: 'relative',
  },
  text: {
    position: 'absolute',
    fontSize: 9,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
