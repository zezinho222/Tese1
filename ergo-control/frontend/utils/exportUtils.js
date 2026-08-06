import { buildTimeAxisLabels } from './chartAxis';
import { formatGap } from './packetLoss';

const CHART_COLORS = {
  emg:      '#F59E0B',
  pitch:    '#3B82F6',
  roll:     '#10B981',
  envelope: '#8B5CF6',
};

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Reduz o número de pontos de um array mantendo a forma geral da curva.
function downsampleForChart(arr, maxPoints = 200) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

// Gera o conteúdo CSV de uma sessão
export function buildSessionCsv({
  sessionNumber, sensorLabel, dateStr, timeStr, durationSec, alertCount, mvc, emgData, imuData,
  envelope, envelopeParams, packetStats,
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

  // Perda de Pacotes
  if (packetStats) {
    lines.push('Perda de Pacotes');
    lines.push(`Pacotes esperados,${packetStats.expected ?? 0}`);
    lines.push(`Pacotes recebidos,${packetStats.received ?? 0}`);
    lines.push(`Pacotes perdidos,${packetStats.lost ?? 0}`);
    lines.push(`Taxa de perda (%),${(packetStats.lossPct ?? 0).toFixed(4)}`);
    lines.push(`Primeiro ID,${packetStats.firstSeq ?? ''}`);
    lines.push(`Último ID,${packetStats.lastSeq ?? ''}`);
    lines.push(`Duplicados,${packetStats.duplicates ?? 0}`);
    lines.push(`Fora de ordem,${packetStats.outOfOrder ?? 0}`);
    if (packetStats.hasEmg) {
      lines.push(`Amostras sEMG recebidas,${packetStats.emgSamplesReceived ?? 0}`);
      lines.push(`Amostras sEMG perdidas,${packetStats.emgSamplesLostEst ?? 0}`);
    }
    if (packetStats.hasImu) {
      lines.push(`Amostras IMU recebidas,${packetStats.imuSamplesReceived ?? 0}`);
      lines.push(`Amostras IMU perdidas,${packetStats.imuSamplesLostEst ?? 0}`);
    }
    lines.push('');
    const gaps = Array.isArray(packetStats.gaps) ? packetStats.gaps : [];
    if (gaps.length > 0) {
      lines.push('IDs em falta');
      lines.push('Primeiro ID,Último ID,Quantidade');
      gaps.forEach((g) => lines.push(`${g.from},${g.to},${g.count}`));
    } else {
      lines.push('IDs em falta,Nenhum');
    }
    lines.push('');
  }

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

  if (Array.isArray(envelope) && envelope.length > 0) {
    const peak = Math.max(...envelope);
    const mean = envelope.reduce((sum, v) => sum + v, 0) / envelope.length;

    lines.push('Envelope RMS');
    if (envelopeParams) {
      lines.push(`Largura da janela (ms),${envelopeParams.windowMs}`);
      lines.push(`Overlap (ms),${envelopeParams.overlapMs}`);
      lines.push(`Amostras / janela,${envelopeParams.windowSamples}`);
      lines.push(`Salto (amostras),${envelopeParams.hopSamples}`);
    }
    lines.push(`Janelas,${envelope.length}`);
    lines.push(`Pico (% MVC),${(peak * 100).toFixed(2)}`);
    lines.push(`Média (% MVC),${(mean * 100).toFixed(2)}`);
    lines.push('');
    lines.push('Janela,Envelope (% MVC)');
    envelope.forEach((v, i) => lines.push(`${i + 1},${(v * 100).toFixed(2)}`));
    lines.push('');
  }

  return lines.join('\n');
}

// Fazer um gráfico SVG de linha
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

  // Eixo Y
  const ySections = 4;
  let yGridLines = '';
  let yLabels = '';
  for (let i = 0; i <= ySections; i++) {
    const v = min + (range * i) / ySections;
    const y = padTop + plotH - (i / ySections) * plotH;
    yGridLines += `<line x1="${padLeft}" y1="${y.toFixed(2)}" x2="${(padLeft + plotW).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3" />`;
    yLabels += `<text x="${(padLeft - 6).toFixed(2)}" y="${(y + 3).toFixed(2)}" font-size="9" fill="#6B7280" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  // Eixo X
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


// Gera o conteúdo HTML de um PDF de sessão
export function buildSessionPdfHtml({
  sessionNumber, sensorLabel, dateStr, timeStr, durationStr, durationSec, alertCount, mvc,
  showEMG, showIMU, emgData, imuData, envelope, envelopeParams, packetStats,
}) {
  const emgChart = showEMG
    ? svgLineChart([{ data: downsampleForChart(emgData), color: CHART_COLORS.emg }], { totalSeconds: durationSec })
    : '';
  const imuChartData = downsampleForChart(imuData || []);
  const imuChart = showIMU
    ? svgLineChart([
        { data: imuChartData.map((p) => p?.[0] ?? 0), color: CHART_COLORS.pitch },
        { data: imuChartData.map((p) => p?.[1] ?? 0), color: CHART_COLORS.roll },
      ], { totalSeconds: durationSec })
    : '';

  const hasEnvelope = showEMG && Array.isArray(envelope) && envelope.length > 0;
  const envelopeChart = hasEnvelope
    ? svgLineChart([{ data: envelope.map((v) => v * 100), color: CHART_COLORS.envelope }], { totalSeconds: durationSec })
    : '';
  const packetGaps = Array.isArray(packetStats?.gaps) ? packetStats.gaps : [];
  const packetBlock = packetStats ? `
    <h2>Integridade da Transmissão</h2>
    <div class="grid">
      <div class="item"><div class="label">Pacotes esperados</div><div class="value">${packetStats.expected ?? 0}</div></div>
      <div class="item"><div class="label">Pacotes recebidos</div><div class="value">${packetStats.received ?? 0}</div></div>
      <div class="item"><div class="label">Pacotes perdidos</div><div class="value">${packetStats.lost ?? 0}</div></div>
      <div class="item"><div class="label">Taxa de perda</div><div class="value">${(packetStats.lossPct ?? 0).toFixed(2)}%</div></div>
      <div class="item"><div class="label">Intervalo de IDs</div><div class="value">${packetStats.firstSeq ?? '-'} &rarr; ${packetStats.lastSeq ?? '-'}</div></div>
      ${packetStats.hasEmg ? `
      <div class="item"><div class="label">Amostras sEMG recebidas</div><div class="value">${packetStats.emgSamplesReceived ?? 0}</div></div>
      <div class="item"><div class="label">Amostras sEMG perdidas </div><div class="value">${packetStats.emgSamplesLostEst ?? 0}</div></div>` : ''}
      ${packetStats.hasImu ? `
      <div class="item"><div class="label">Amostras IMU recebidas</div><div class="value">${packetStats.imuSamplesReceived ?? 0}</div></div>
      <div class="item"><div class="label">Amostras IMU perdidas </div><div class="value">${packetStats.imuSamplesLostEst ?? 0}</div></div>` : ''}
    </div>
    <div class="label">${packetGaps.length > 0
      ? `IDs em falta: ${packetGaps.map((g) => formatGap(g)).join(' | ')}${packetStats.gapsTruncated ? ' ...' : ''}`
      : 'Nenhum ID em falta - sequencia de pacotes completa.'}</div>
  ` : '';

  const envelopePeak = hasEnvelope ? Math.max(...envelope) : 0;
  const envelopeMean = hasEnvelope ? envelope.reduce((sum, v) => sum + v, 0) / envelope.length : 0;

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
        ${packetBlock}
        ${showEMG ? `<h2>sEMG - Resumo da Sessão</h2>${emgChart}` : ''}
        ${hasEnvelope ? `
          <h2>Envelope RMS - Resumo da Sessão</h2>
          ${envelopeChart}
          <div class="grid">
            <div class="item"><div class="label">Janelas</div><div class="value">${envelope.length}</div></div>
            <div class="item"><div class="label">Pico</div><div class="value">${(envelopePeak * 100).toFixed(1)}% MVC</div></div>
            <div class="item"><div class="label">Média</div><div class="value">${(envelopeMean * 100).toFixed(1)}% MVC</div></div>
            ${envelopeParams ? `<div class="item"><div class="label">Janela / Salto</div><div class="value">${envelopeParams.windowMs}ms / ${envelopeParams.overlapMs}ms</div></div>` : ''}
          </div>
        ` : ''}
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