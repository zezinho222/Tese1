// Formata um valor em segundos para exibição no eixo do gráfico
function formatAxisSeconds(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem.toString().padStart(2, '0')}s` : `${m}m`;
}

// Gera rótulos de eixo para um gráfico de tempo, dado o número de pontos, a duração total em segundos e o número desejado de ticks
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