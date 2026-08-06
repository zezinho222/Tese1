export const SEQ_MODULO = 65536; // seq é uint16

// Nº máximo de intervalos de falha guardados (para não crescer sem limite
// numa ligação muito má e rebentar com a memória / com o AsyncStorage)
const MAX_GAPS = 300;

// Nº máximo de IDs individuais expandidos para mostrar ao utilizador
const MAX_IDS_LISTED = 200;

export function createPacketTracker({ modulo = SEQ_MODULO, maxGaps = MAX_GAPS } = {}) {
  let firstSeq = null;
  let lastSeq = null;
  let received = 0;
  let lost = 0;
  let duplicates = 0;
  let outOfOrder = 0;
  let wraps = 0;
  let emgSamplesSeen = 0;
  let imuSamplesSeen = 0;
  let gaps = [];
  let gapsTruncated = false;
  let startedAt = null;
  let lastAt = null;

  function reset() {
    firstSeq = null;
    lastSeq = null;
    received = 0;
    lost = 0;
    duplicates = 0;
    outOfOrder = 0;
    wraps = 0;
    emgSamplesSeen = 0;
    imuSamplesSeen = 0;
    gaps = [];
    gapsTruncated = false;
    startedAt = null;
    lastAt = null;
  }

  function track(seq, { emgSamples = 0, imuSamples = 0, now = Date.now() } = {}) {
    if (!Number.isFinite(seq)) return null;
    const id = ((Math.trunc(seq) % modulo) + modulo) % modulo;

    received += 1;
    emgSamplesSeen += emgSamples;
    imuSamplesSeen += imuSamples;
    lastAt = now;

    if (firstSeq === null) {
      firstSeq = id;
      lastSeq = id;
      startedAt = now;
      return null;
    }

    const expected = (lastSeq + 1) % modulo;

    if (id === expected) {
      if (id === 0) wraps += 1; // passou de 65535 para 0
      lastSeq = id;
      return null;
    }

    const forward = (id - expected + modulo) % modulo;

    // Salto para a frente "razoável" -> perderam-se `forward` pacotes
    if (forward > 0 && forward < modulo / 2) {
      const from = expected;
      const to = (id - 1 + modulo) % modulo;

      lost += forward;
      if (gaps.length < maxGaps) gaps.push({ from, to, count: forward });
      else gapsTruncated = true;

      if (id < lastSeq) wraps += 1;
      lastSeq = id;
      return { from, to, count: forward };
    }

    // Salto "para trás" -> pacote repetido ou fora de ordem
    if (id === lastSeq) duplicates += 1;
    else outOfOrder += 1;
    return null;
  }

  function getReport(overrides = {}) {
    const expected = received + lost;

    const emgRx = overrides.emgSamplesReceived ?? emgSamplesSeen;
    const imuRx = overrides.imuSamplesReceived ?? imuSamplesSeen;

    const hasEmg = overrides.hasEmg ?? emgRx > 0;
    const hasImu = overrides.hasImu ?? imuRx > 0;

    const avgEmg = received > 0 ? emgRx / received : 0;
    const avgImu = received > 0 ? imuRx / received : 0;

    return {
      firstSeq,
      lastSeq,
      received,
      lost,
      expected,
      lossPct: expected > 0 ? (lost / expected) * 100 : 0,
      duplicates,
      outOfOrder,
      wraps,
      emgSamplesReceived: emgRx,
      imuSamplesReceived: imuRx,
      emgSamplesLostEst: hasEmg ? Math.round(lost * avgEmg) : 0,
      imuSamplesLostEst: hasImu ? Math.round(lost * avgImu) : 0,
      hasEmg,
      hasImu,
      gaps: gaps.map((g) => ({ ...g })),
      gapsTruncated,
      durationMs: startedAt != null && lastAt != null ? lastAt - startedAt : 0,
    };
  }

  return { reset, track, getReport };
}

export function expandMissingIds(gaps, limit = MAX_IDS_LISTED, modulo = SEQ_MODULO) {
  const ids = [];
  if (!Array.isArray(gaps)) return ids;
  for (const g of gaps) {
    for (let i = 0; i < g.count; i++) {
      if (ids.length >= limit) return ids;
      ids.push((g.from + i) % modulo);
    }
  }
  return ids;
}

// "4507" para um único ID, "4880–4885 (6)" para um intervalo
export function formatGap(gap) {
  if (!gap) return '';
  if (gap.count === 1) return `${gap.from}`;
  return `${gap.from}–${gap.to} (${gap.count})`;
}

export function toStoredStats(report, { maxGaps = 100 } = {}) {
  if (!report) return null;
  return {
    firstSeq: report.firstSeq,
    lastSeq: report.lastSeq,
    received: report.received,
    lost: report.lost,
    expected: report.expected,
    lossPct: Number(report.lossPct.toFixed(4)),
    duplicates: report.duplicates,
    outOfOrder: report.outOfOrder,
    wraps: report.wraps,
    emgSamplesReceived: report.emgSamplesReceived ?? 0,
    imuSamplesReceived: report.imuSamplesReceived ?? 0,
    emgSamplesLostEst: report.emgSamplesLostEst ?? 0,
    imuSamplesLostEst: report.imuSamplesLostEst ?? 0,
    hasEmg: !!report.hasEmg,
    hasImu: !!report.hasImu,
    gaps: report.gaps.slice(0, maxGaps),
    gapsTruncated: report.gapsTruncated || report.gaps.length > maxGaps,
  };
}

// Terminal
export function formatPacketReport(report, { sensorType, durationSec } = {}) {
  if (!report) return '[ErgoControl] Sem estatísticas de pacotes.';

  const pad = (label) => (label + ' ').padEnd(28, '.');
  const L = [];
  const line = '─'.repeat(60);

  L.push(line);
  L.push('[ErgoControl] Integridade dos pacotes — monitorização terminada');
  L.push(line);
  if (sensorType) L.push(`  ${pad('Modo')} ${sensorType}`);
  if (durationSec != null) L.push(`  ${pad('Duração')} ${durationSec} s`);

  if (report.received === 0) {
    L.push('  Não foi recebido nenhum pacote nesta sessão.');
    L.push(line);
    return L.join('\n');
  }

  L.push(`  ${pad('Intervalo de IDs')} ${report.firstSeq} → ${report.lastSeq}` +
    (report.wraps > 0 ? ` (${report.wraps}x wrap-around)` : ''));
  L.push(`  ${pad('Pacotes esperados')} ${report.expected}`);
  L.push(`  ${pad('Pacotes recebidos')} ${report.received}`);
  L.push(`  ${pad('Pacotes perdidos')} ${report.lost} (${report.lossPct.toFixed(3)}%)`);
  L.push(`  ${pad('Duplicados')} ${report.duplicates}`);
  L.push(`  ${pad('Fora de ordem')} ${report.outOfOrder}`);
  if (report.hasEmg) {
    L.push(`  ${pad('Amostras sEMG recebidas')} ${report.emgSamplesReceived}`);
    L.push(`  ${pad('Amostras sEMG perdidas')} ~${report.emgSamplesLostEst} (estimativa)`);
  }
  if (report.hasImu) {
    L.push(`  ${pad('Amostras IMU recebidas')} ${report.imuSamplesReceived}`);
    L.push(`  ${pad('Amostras IMU perdidas')} ~${report.imuSamplesLostEst} (estimativa)`);
  }

  if (report.lost === 0) {
    L.push('  ✔ Nenhum ID em falta — sequência completa.');
  } else {
    L.push(`  IDs em falta (${report.gaps.length} intervalo(s)):`);
    report.gaps.forEach((g) => L.push(`      ${formatGap(g)}`));
    if (report.gapsTruncated) L.push('      ... (lista truncada)');
  }

  L.push(line);
  return L.join('\n');
}