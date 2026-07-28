/**
 * chartAxis.js
 * Helpers puros (sem dependências de UI) para gerar as etiquetas do eixo do
 * tempo dos gráficos de sEMG/IMU — usados tanto pelos gráficos ao vivo
 * (react-native-gifted-charts, em MonitoringPage/HistoryDetailPage) como
 * pelo gráfico em SVG do relatório PDF (utils/exportUtils.js), para as duas
 * versões mostrarem sempre os mesmos valores.
 */

export function formatAxisSeconds(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem.toString().padStart(2, '0')}s` : `${m}m`;
}

/**
 * Devolve um array com o mesmo tamanho de `pointCount`, com string vazia em
 * quase todas as posições exceto em `tickCount` pontos espaçados
 * uniformemente, onde coloca o tempo aproximado (formatado) desse ponto —
 * assume amostragem uniforme ao longo de `totalSeconds` (do primeiro ao
 * último ponto).
 */
export function buildTimeAxisLabels(pointCount, totalSeconds, tickCount = 5) {
  if (!pointCount || pointCount <= 0) return [];
  const labels = new Array(pointCount).fill('');
  if (pointCount === 1) {
    labels[0] = formatAxisSeconds(totalSeconds);
    return labels;
  }
  const ticks = Math.max(2, Math.min(tickCount, pointCount));
  const step = (pointCount - 1) / (ticks - 1);
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round(i * step);
    const t = ((totalSeconds || 0) * idx) / (pointCount - 1);
    labels[idx] = formatAxisSeconds(t);
  }
  return labels;
}

/**
 * Estima quantos segundos representa a janela visível (últimos `visibleCount`
 * pontos) de um buffer que já tem `totalSamples` amostras acumuladas ao fim
 * de `elapsedSec` segundos de monitorização — usado no gráfico ao vivo, que
 * mostra só a "cauda" do buffer, para saber a que intervalo de tempo (relativo,
 * "há quantos segundos") essa cauda corresponde.
 */
export function estimateWindowSeconds(totalSamples, visibleCount, elapsedSec) {
  if (!totalSamples || !elapsedSec || totalSamples <= 0 || elapsedSec <= 0) return 0;
  const rate = totalSamples / elapsedSec; // amostras por segundo
  return rate > 0 ? visibleCount / rate : 0;
}
