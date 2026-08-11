// Valores default da janela e do overlap, em ms
export const DEFAULT_WINDOW_MS  = 125;
export const DEFAULT_OVERLAP_MS = 6.25;

// Frequência de corte do filtro
export const DEFAULT_HP_CUTOFF_HZ = 20;

// Fundo de escala do ADC e margem para detetar saturação
export const ADC_FULL_SCALE = 65535;
const SATURATION_MARGIN = 64;

// Média
function mean(signal) {
  if (!signal.length) return 0;
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i];
  return sum / signal.length;
}

// Remove a componente DC (offset) subtraindo a média do sinal
export function removeDcOffset(signal) {
  const dc  = mean(signal);
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] - dc;
  return out;
}


export function highPassFilter(signal, fs, cutoffHz = DEFAULT_HP_CUTOFF_HZ) {
  const n = signal.length;
  const out = new Float64Array(n);
  if (n === 0) return out;

  if (!fs || fs <= 0 || !cutoffHz || cutoffHz <= 0 || cutoffHz >= fs / 2) {
    return removeDcOffset(signal);
  }

  const dt = 1 / fs;
  const RC = 1 / (2 * Math.PI * cutoffHz);
  const a  = RC / (RC + dt);

  let prevX = signal[0];
  let prevY = 0;
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    const x = signal[i];
    const y = a * (prevY + x - prevX);
    out[i] = y;
    prevX = x;
    prevY = y;
  }
  return out;
}

// Pré-processamento comum a todos os cálculos de RMS
export function preprocess(raw, { fs, hpCutoffHz = DEFAULT_HP_CUTOFF_HZ } = {}) {
  if (!raw || raw.length === 0) return new Float64Array(0);
  return (fs && fs > 0)
    ? highPassFilter(raw, fs, hpCutoffHz)
    : removeDcOffset(raw);
}


// Envelope RMS com janela deslizante e salto configurável
export function rmsEnvelope(signal, windowSamples, hopSamples = 1) {
  const result = [];
  const N   = signal.length;
  const w   = Math.max(1, Math.round(windowSamples));
  const hop = Math.max(1, Math.round(hopSamples));
  if (N < w) return result;

  for (let i = 0; i + w - 1 < N; i += hop) {
    let sumSq = 0;
    for (let k = i; k < i + w; k++) {
      const v = signal[k];
      sumSq += v * v;
    }
    result.push(Math.sqrt(sumSq / w));
  }
  return result;
}

// Percentil de um array
export function percentileOf(values, percentile = 100) {
  if (!values || values.length === 0) return 0;
  if (percentile >= 100) {
    let max = -Infinity;
    for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    return max === -Infinity ? 0 : max;
  }
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = (percentile / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Qualidade do sinal de calibração
export function signalQuality(raw) {
  if (!raw || raw.length === 0) {
    return { dc: 0, min: 0, max: 0, saturatedPct: 0, samples: 0 };
  }
  let min = Infinity, max = -Infinity, sat = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v < min) min = v;
    if (v > max) max = v;
    if (v >= ADC_FULL_SCALE - SATURATION_MARGIN || v <= SATURATION_MARGIN) sat++;
  }
  return {
    dc: mean(raw),
    min,
    max,
    saturatedPct: (sat / raw.length) * 100,
    samples: raw.length,
  };
}

// Calcula o MVC a partir do envelope RMS do sinal de calibração
export function calculateMVC(raw, opts = {}) {
  // Compatibilidade com a assinatura antiga: calculateMVC(signal, windowSamples)
  const o = typeof opts === 'number' ? { windowSamples: opts } : (opts || {});

  const {
    fs,
    windowMs   = DEFAULT_WINDOW_MS,
    hopMs,
    percentile = 100,
    hpCutoffHz = DEFAULT_HP_CUTOFF_HZ,
    windowSamples: forcedWindowSamples,
  } = o;

  const quality = signalQuality(raw);

  const empty = {
    mvc: 0, envelope: [], windowSamples: 0, hopSamples: 0,
    fs: fs || 0, windowMs, percentile, quality,
  };

  if (!raw || raw.length === 0) return empty;

  // Janela em amostras
  let w;
  if (forcedWindowSamples) {
    w = Math.round(forcedWindowSamples);
  } else if (fs && fs > 0) {
    w = Math.round((windowMs / 1000) * fs);
  } else {
    w = 50; // fallback histórico
  }
  if (w < 1) w = 1;

  const hop = (hopMs && fs && fs > 0) ? Math.max(1, Math.round((hopMs / 1000) * fs)) : 1;

  if (raw.length < w) return { ...empty, windowSamples: w, hopSamples: hop };

  const clean    = preprocess(raw, { fs, hpCutoffHz });
  const envelope = rmsEnvelope(clean, w, hop);
  const mvc      = percentileOf(envelope, percentile);

  return {
    mvc,
    envelope,
    windowSamples: w,
    hopSamples: hop,
    fs: fs || 0,
    windowMs,
    percentile,
    quality,
  };
}

// Envelope RMS de uma sessão completa, normalizado pelo MVC
export function computeRmsEnvelope(rawSignal, {
  mvc,
  fs,
  windowMs   = DEFAULT_WINDOW_MS,
  overlapMs  = DEFAULT_OVERLAP_MS,
  hpCutoffHz = DEFAULT_HP_CUTOFF_HZ,
} = {}) {
  const empty = {
    envelope: [], windowSamples: 0, hopSamples: 0,
    fs: fs || 0, windowMs, overlapMs, peak: 0, mean: 0,
  };

  if (!Array.isArray(rawSignal) || rawSignal.length === 0) return empty;
  if (!fs || fs <= 0) return empty;

  // nº de amostras da janela = largura da janela (s) × freq
  const w = Math.round((windowMs / 1000) * fs); // divido por 1000 para converter ms em s
  // nº de amostras do salto = (largura da janela − overlap) (s) × freq
  const hop = Math.round(((windowMs - overlapMs) / 1000) * fs); // divido por 1000 para converter ms em s

  if (w < 1 || hop < 1 || rawSignal.length < w) {
    return { ...empty, windowSamples: w, hopSamples: hop };
  }

  // 1) remover DC (mesmo tratamento que na calibração)
  const clean = preprocess(rawSignal, { fs, hpCutoffHz });

  // 2) envelope RMS
  const rms = rmsEnvelope(clean, w, hop);

  // 3) normalizar pelo MVC
  const scale = (mvc && mvc !== 0) ? 1 / mvc : 1;
  const envelope = rms.map((v) => v * scale);

  let peak = 0;
  let sum  = 0;
  for (const v of envelope) {
    if (v > peak) peak = v;
    sum += v;
  }

  return {
    envelope,
    windowSamples: w,
    hopSamples: hop,
    fs,
    windowMs,
    overlapMs,
    peak,
    mean: envelope.length ? sum / envelope.length : 0,
  };
}