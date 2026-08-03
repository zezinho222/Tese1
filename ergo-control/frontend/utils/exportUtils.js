/**
 * exportUtils.js
 * Geração do conteúdo dos exports da HistoryDetailPage — CSV (só valores,
 * sem imagens de gráfico) e PDF (relatório completo, incluindo os
 * gráficos). Os gráficos do PDF são desenhados como SVG diretamente a
 * partir dos valores guardados (emgData/imuData) em vez de tirar um
 * "screenshot" do gráfico no ecrã — assim não depende de nenhuma
 * biblioteca nativa extra (ex: react-native-view-shot) e o resultado é
 * sempre igual, independentemente do aparelho.
 */

import { buildTimeAxisLabels } from './chartAxis';

const CHART_COLORS = {
  emg:   '#F59E0B',
  pitch: '#3B82F6',
  roll:  '#10B981',
};

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Reduz um array para no máximo maxPoints, só para desenhar o gráfico do PDF — o CSV usa sempre os dados em bruto. */
function downsampleForChart(arr, maxPoints = 200) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

/** CSV com o resumo da sessão + os valores brutos dos gráficos (sem imagens). */
export function buildSessionCsv({
  sessionNumber, sensorLabel, dateStr, timeStr, durationSec, alertCount, mvc, emgData, imuData,
}) {
  const lines = [];
  lines.push('Resumo da Sessão');
  lines.push(`Sessão,#${sessionNumber}`);
  lines.push(`Data,${csvEscape(dateStr)}`);
  lines.push(`Início,${csvEscape(timeStr)}`);
  lines.push(`Duração (s),${durationSec ?? 0}`);
  lines.push(`Sensor,${csvEscape(sensorLabel)}`);
  lines.push(`Alertas,${alertCount ?? 0}`);
  if (mvc != null) lines.push(`MVC,${mvc}`);
  lines.push('');

  if (Array.isArray(emgData) && emgData.length > 0) {
    lines.push('Dados sEMG');
    lines.push('Amostra,Valor');
    emgData.forEach((v, i) => lines.push(`${i + 1},${v}`));
    lines.push('');
  }

  if (Array.isArray(imuData) && imuData.length > 0) {
    lines.push('Dados IMU');
    lines.push('Amostra,Pitch,Roll');
    imuData.forEach((p, i) => lines.push(`${i + 1},${p?.[0] ?? ''},${p?.[1] ?? ''}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Desenha um gráfico de linha em SVG a partir de uma ou mais séries de
 * valores, com eixo X (tempo, ver utils/chartAxis.js — a mesma lógica usada
 * nos gráficos ao vivo no ecrã) e eixo Y (valores, com grelha e etiquetas
 * numéricas), para o PDF mostrar exatamente a mesma informação que o ecrã.
 */
function svgLineChart(series, { width = 620, height = 240, totalSeconds = 0 } = {}) {
  const padLeft = 44, padRight = 12, padTop = 12, padBottom = 28;
  const allValues = series.flatMap((s) => s.data).filter((v) => typeof v === 'number' && !Number.isNaN(v));

  if (allValues.length === 0) {
    return `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;background:#F3F4F6;border-radius:10px;color:#6B7280;font-size:13px;">Sem dados de gráfico guardados para esta sessão</div>`;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const n = Math.max(...series.map((s) => s.data.length), 1);

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const xStep = n > 1 ? plotW / (n - 1) : 0;

  const toPoint = (v, i) => {
    const x = padLeft + i * xStep;
    const y = padTop + plotH - ((v - min) / range) * plotH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const polylines = series
    .map((s) => {
      if (!s.data.length) return '';
      const points = s.data.map((v, i) => toPoint(v, i)).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
    })
    .join('');

  // Eixo Y — grelha horizontal + valor numérico em cada secção
  const ySections = 4;
  let yGridLines = '';
  let yLabels = '';
  for (let i = 0; i <= ySections; i++) {
    const v = min + (range * i) / ySections;
    const y = padTop + plotH - (i / ySections) * plotH;
    yGridLines += `<line x1="${padLeft}" y1="${y.toFixed(2)}" x2="${(padLeft + plotW).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3" />`;
    yLabels += `<text x="${(padLeft - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}" font-size="9" fill="#6B7280" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  // Eixo X — etiquetas de tempo (mesma lógica dos gráficos no ecrã)
  let xLabels = '';
  buildTimeAxisLabels(n, totalSeconds, 5).forEach((label, i) => {
    if (!label) return;
    const x = padLeft + i * xStep;
    xLabels += `<text x="${x.toFixed(2)}" y="${(height - padBottom + 14).toFixed(2)}" font-size="9" fill="#6B7280" text-anchor="middle">${label}</text>`;
  });

  const axisLines = `
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${(padTop + plotH).toFixed(2)}" stroke="#9CA3AF" stroke-width="1" />
    <line x1="${padLeft}" y1="${(padTop + plotH).toFixed(2)}" x2="${(padLeft + plotW).toFixed(2)}" y2="${(padTop + plotH).toFixed(2)}" stroke="#9CA3AF" stroke-width="1" />
  `;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;">${yGridLines}${axisLines}${polylines}${yLabels}${xLabels}</svg>`;
}

/** HTML do relatório completo (resumo + gráficos) a converter em PDF via expo-print. */
export function buildSessionPdfHtml({
  sessionNumber, sensorLabel, dateStr, timeStr, durationStr, durationSec, alertCount, mvc,
  showEMG, showIMU, emgData, imuData,
}) {
  const emgChart = showEMG
    ? svgLineChart([{ data: downsampleForChart(emgData), color: CHART_COLORS.emg }], { totalSeconds: durationSec })
    : '';
  // Reduz UMA vez e usa a mesma redução para Pitch e Roll, para que as duas
  // linhas fiquem alinhadas no tempo (reduzir cada uma em separado daria os
  // mesmos índices, mas assim fica explícito e evita percorrer o array 2×).
  const imuChartData = downsampleForChart(imuData || []);
  const imuChart = showIMU
    ? svgLineChart([
        { data: imuChartData.map((p) => p?.[0] ?? 0), color: CHART_COLORS.pitch },
        { data: imuChartData.map((p) => p?.[1] ?? 0), color: CHART_COLORS.roll },
      ], { totalSeconds: durationSec })
    : '';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1F2937; padding: 24px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          h2 { font-size: 16px; margin: 24px 0 8px; }
          .grid { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0 24px; }
          .item { min-width: 140px; }
          .label { font-size: 12px; color: #6B7280; font-weight: 500; }
          .value { font-size: 18px; font-weight: 700; }
          .legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #6B7280; }
          .dot { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin-right: 6px; vertical-align: middle; }
        </style>
      </head>
      <body>
        <h1>Sessão #${sessionNumber}</h1>
        <div class="grid">
          <div class="item"><div class="label">Data</div><div class="value">${dateStr}</div></div>
          <div class="item"><div class="label">Início</div><div class="value">${timeStr}</div></div>
          <div class="item"><div class="label">Duração</div><div class="value">${durationStr}</div></div>
          <div class="item"><div class="label">Módulos</div><div class="value">${sensorLabel}</div></div>
          <div class="item"><div class="label">Alertas</div><div class="value">${alertCount ?? 0}</div></div>
          ${mvc != null ? `<div class="item"><div class="label">MVC</div><div class="value">${mvc}</div></div>` : ''}
        </div>
        ${showEMG ? `<h2>sEMG - Resumo da Sessão</h2>${emgChart}` : ''}
        ${showIMU ? `
          <h2>IMU - Resumo da Sessão</h2>
          ${imuChart}
          <div class="legend">
            <span><span class="dot" style="background:${CHART_COLORS.pitch}"></span>Pitch</span>
            <span><span class="dot" style="background:${CHART_COLORS.roll}"></span>Roll</span>
          </div>
        ` : ''}
      </body>
    </html>
  `;
}