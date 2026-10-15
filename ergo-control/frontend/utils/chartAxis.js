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
  // pointCount tem de ser um inteiro finito: new Array(289.43) lança
  // "RangeError: invalid array length". Em Android a largura do ecrã
  // (Dimensions) costuma ser fracionária, por isso arredondamos aqui.
  const count = Math.floor(Number(pointCount));
  if (!Number.isFinite(count) || count <= 0) return [];

  const labels = new Array(count).fill('');
  if (count === 1) {
    labels[0] = formatAxisSeconds(totalSeconds);
    return labels;
  }
  const ticks = Math.max(2, Math.min(tickCount, count));
  const step = (count - 1) / (ticks - 1);
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round(i * step);
    const t = ((totalSeconds || 0) * idx) / (count - 1);
    labels[idx] = formatAxisSeconds(t);
  }
  return labels;
}