import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../utils/shared-Styles';

// Como a biblioteca de gráficos não permite customizar o eixo x, criamos um eixo x customizado para os gráficos (grafico EMG, Envelope e IMU)
// É renderizado em baixo do gráfico, e cada label é posicionada de acordo com a largura do gráfico e a quantidade de labels
export default function ChartTimeAxis({
  labels,
  chartWidth,
  yAxisLabelWidth = 0,
  initialSpacing = 4,
  endSpacing = 4,
  labelWidth = 32,
}) {
  // Garantir que a largura do gráfico seja pelo menos 0 para evitar problemas de renderização
  const n = labels?.length ?? 0;
  if (n === 0) return null;

  // 
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
