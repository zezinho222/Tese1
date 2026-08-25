// Valores default da janela e do overlap, em ms
export const DEFAULT_WINDOW_MS  = 125;
export const DEFAULT_OVERLAP_MS = 6.25;

// Frequência de corte do filtro
export const DEFAULT_HP_CUTOFF_HZ = 20;

// Parâmetros do filtro de Hampel (deteção de outliers antes da filtragem).
// A meia-janela e a guarda são definidas em ms e convertidas para amostras com
// a frequência de amostragem, para serem independentes do fs escolhido.
export const DEFAULT_HAMPEL_HALF_WINDOW_MS = 10;  // k = 0.01 * fs amostras de cada lado
export const DEFAULT_HAMPEL_NSIGMA         = 5;   // limiar: quanto maior, menos outliers
export const DEFAULT_HAMPEL_GUARD_MS       = 3;   // dilatação da máscara: 0.003 * fs
const HAMPEL_FALLBACK_HALF_WINDOW = 10;           // usado quando fs é desconhecido
const HAMPEL_FALLBACK_GUARD       = 3;

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


/* --------------------------------------------------------------------------
   Filtro de Hampel
   Deteta amostras anómalas (artefactos de movimento, picos de comutação) com
   base na mediana e no desvio absoluto mediano (MAD) de uma janela deslizante,
   marca também uma guarda em torno de cada outlier e substitui as amostras
   marcadas por interpolação cúbica monótona (PCHIP).
   Equivalente ao pipeline hampel/imdilate/fillmissing('pchip') do MATLAB.
   -------------------------------------------------------------------------- */

// Máscara de outliers: 1 quando |x[i] - mediana| > nSigma * 1.4826 * MAD.
// Janela deslizante mantida ordenada => mediana em O(1) e MAD em O(k) sem ordenar.
export function hampelMask(signal, k, nSigma = DEFAULT_HAMPEL_NSIGMA) {
  const n = signal.length;
  const mask = new Uint8Array(n);
  if (n === 0 || k < 1) return mask;

  const S = new Float64Array(2 * k + 1); // janela ordenada
  let m = 0;

  const insert = (v) => {
    let lo = 0, hi = m;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid] < v) lo = mid + 1; else hi = mid; }
    if (lo < m) S.copyWithin(lo + 1, lo, m);
    S[lo] = v; m++;
  };
  const remove = (v) => {
    let lo = 0, hi = m;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid] < v) lo = mid + 1; else hi = mid; }
    if (lo < m - 1) S.copyWithin(lo, lo + 1, m);
    m--;
  };

  // Janela inicial (truncada nas extremidades, como o hampel do MATLAB)
  const first = k < n ? k : n - 1;
  for (let j = 0; j <= first; j++) insert(signal[j]);

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const del = i - k - 1;
      const add = i + k;
      if (del >= 0) remove(signal[del]);   // remover antes de inserir: a janela nunca excede 2k+1
      if (add < n)  insert(signal[add]);
    }

    const mid = m >> 1;
    const odd = (m & 1) === 1;
    const med = odd ? S[mid] : (S[mid - 1] + S[mid]) / 2;

    // MAD = mediana de |S[j] - med|. Como S está ordenado, os desvios crescem
    // ao afastar-se do centro: basta fundir os dois lados até ao elemento central.
    let a = odd ? mid : mid - 1;
    let b = a + 1;
    const target = odd ? (m - 1) >> 1 : m >> 1;
    let dev = 0, prev = 0;
    for (let c = 0; c <= target; c++) {
      const dl = a >= 0 ? med - S[a] : Infinity;
      const dr = b < m  ? S[b] - med : Infinity;
      prev = dev;
      if (dl <= dr) { dev = dl; a--; } else { dev = dr; b++; }
    }
    const mad = odd ? dev : (prev + dev) / 2;

    if (Math.abs(signal[i] - med) > nSigma * 1.4826 * mad) mask[i] = 1;
  }
  return mask;
}

// Dilata a máscara guard amostras para cada lado (equivalente ao imdilate)
export function dilateMask(mask, guard) {
  const n = mask.length;
  if (guard < 1 || n === 0) return mask;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const lo = i - guard < 0 ? 0 : i - guard;
    const hi = i + guard > n - 1 ? n - 1 : i + guard;
    for (let j = lo; j <= hi; j++) out[j] = 1;
  }
  return out;
}

// Derivada nas extremidades (fórmula de três pontos usada pelo pchip do MATLAB)
function pchipEndSlope(h1, h2, del1, del2) {
  let d = ((2 * h1 + h2) * del1 - h1 * del2) / (h1 + h2);
  if (d * del1 <= 0) d = 0;
  else if (del1 * del2 < 0 && Math.abs(d) > Math.abs(3 * del1)) d = 3 * del1;
  return d;
}

// Substitui as amostras marcadas por interpolação PCHIP sobre as restantes.
// Fora do intervalo das amostras válidas mantém-se o valor mais próximo
// (equivalente a fillmissing(..., 'EndValues', 'nearest')).
export function fillMaskedPchip(signal, mask) {
  const n = signal.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = signal[i];

  let valid = 0;
  for (let i = 0; i < n; i++) if (!mask[i]) valid++;
  if (valid === 0 || valid === n) return out; // nada a interpolar (ou nada válido)

  const xs = new Float64Array(valid);
  const ys = new Float64Array(valid);
  let p = 0;
  for (let i = 0; i < n; i++) if (!mask[i]) { xs[p] = i; ys[p] = signal[i]; p++; }

  if (valid === 1) { for (let i = 0; i < n; i++) out[i] = ys[0]; return out; }

  const h   = new Float64Array(valid - 1);
  const del = new Float64Array(valid - 1);
  for (let i = 0; i < valid - 1; i++) {
    h[i]   = xs[i + 1] - xs[i];
    del[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  const d = new Float64Array(valid);
  if (valid === 2) {
    d[0] = del[0]; d[1] = del[0];
  } else {
    for (let i = 1; i < valid - 1; i++) {
      if (del[i - 1] * del[i] > 0) {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]); // média harmónica ponderada
      } else {
        d[i] = 0; // extremo local: derivada nula preserva a monotonia
      }
    }
    d[0] = pchipEndSlope(h[0], h[1], del[0], del[1]);
    d[valid - 1] = pchipEndSlope(h[valid - 2], h[valid - 3], del[valid - 2], del[valid - 3]);
  }

  let seg = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    if (i < xs[0])          { out[i] = ys[0];         continue; }
    if (i > xs[valid - 1])  { out[i] = ys[valid - 1]; continue; }
    while (seg < valid - 2 && xs[seg + 1] < i) seg++;
    const hh = h[seg];
    const s  = (i - xs[seg]) / hh;
    const s2 = s * s;
    const s3 = s2 * s;
    out[i] = ys[seg]       * (2 * s3 - 3 * s2 + 1)
           + hh * d[seg]   * (s3 - 2 * s2 + s)
           + ys[seg + 1]   * (-2 * s3 + 3 * s2)
           + hh * d[seg + 1] * (s3 - s2);
  }
  return out;
}

// Aplica o filtro de Hampel completo: deteção -> guarda -> interpolação.
// Devolve o sinal corrigido e estatísticas da correção.
export function hampelFilter(signal, {
  fs,
  halfWindowMs = DEFAULT_HAMPEL_HALF_WINDOW_MS,
  nSigma       = DEFAULT_HAMPEL_NSIGMA,
  guardMs      = DEFAULT_HAMPEL_GUARD_MS,
} = {}) {
  const n = signal ? signal.length : 0;
  const empty = { signal: signal || [], outliers: 0, corrected: 0, correctedPct: 0, k: 0, guard: 0, nSigma };
  if (n === 0) return empty;

  const usable = fs && fs > 0;
  const k = usable
    ? Math.max(1, Math.round((halfWindowMs / 1000) * fs))
    : HAMPEL_FALLBACK_HALF_WINDOW;
  const guard = usable
    ? Math.max(0, Math.round((guardMs / 1000) * fs))
    : HAMPEL_FALLBACK_GUARD;

  if (n < 2 * k + 1) return { ...empty, k, guard };

  const raw = hampelMask(signal, k, nSigma);
  let outliers = 0;
  for (let i = 0; i < n; i++) outliers += raw[i];
  if (outliers === 0) {
    return { signal, outliers: 0, corrected: 0, correctedPct: 0, k, guard, nSigma };
  }

  const mask = dilateMask(raw, guard);
  let corrected = 0;
  for (let i = 0; i < n; i++) corrected += mask[i];

  // Se praticamente tudo foi marcado, o limiar não é adequado a este sinal:
  // devolve o original em vez de reconstruir a sessão inteira por interpolação.
  if (corrected >= n * 0.5) {
    return { signal, outliers, corrected: 0, correctedPct: 0, k, guard, nSigma, skipped: true };
  }

  return {
    signal: fillMaskedPchip(signal, mask),
    outliers,
    corrected,
    correctedPct: (corrected / n) * 100,
    k,
    guard,
    nSigma,
  };
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

/* Pré-processamento comum a todos os cálculos de RMS:
   1) filtro de Hampel (remoção de outliers + interpolação PCHIP)
   2) filtro passa-alto (ou apenas remoção de DC se fs for desconhecido)
   A ordem segue o procedimento de referência: os artefactos são retirados
   antes da filtragem, para não excitarem a resposta do filtro. */
export function preprocessWithStats(raw, {
  fs,
  hpCutoffHz   = DEFAULT_HP_CUTOFF_HZ,
  hampel       = true,
  hampelNSigma = DEFAULT_HAMPEL_NSIGMA,
  hampelHalfWindowMs = DEFAULT_HAMPEL_HALF_WINDOW_MS,
  hampelGuardMs      = DEFAULT_HAMPEL_GUARD_MS,
} = {}) {
  if (!raw || raw.length === 0) {
    return { clean: new Float64Array(0), hampelStats: null };
  }

  let input = raw;
  let hampelStats = null;

  if (hampel) {
    const h = hampelFilter(raw, {
      fs,
      nSigma:       hampelNSigma,
      halfWindowMs: hampelHalfWindowMs,
      guardMs:      hampelGuardMs,
    });
    input = h.signal;
    hampelStats = {
      outliers:     h.outliers,
      corrected:    h.corrected,
      correctedPct: h.correctedPct,
      windowSamples: 2 * h.k + 1,
      guardSamples:  h.guard,
      nSigma:        h.nSigma,
    };
  }

  const clean = (fs && fs > 0)
    ? highPassFilter(input, fs, hpCutoffHz)
    : removeDcOffset(input);

  return { clean, hampelStats };
}

// Mantém a assinatura antiga (devolve só o sinal)
export function preprocess(raw, opts = {}) {
  return preprocessWithStats(raw, opts).clean;
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

  const { clean, hampelStats } = preprocessWithStats(raw, { fs, hpCutoffHz, ...o });
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
    hampel: hampelStats,
  };
}

// Envelope RMS de uma sessão completa, normalizado pelo MVC
export function computeRmsEnvelope(rawSignal, {
  mvc,
  fs,
  windowMs   = DEFAULT_WINDOW_MS,
  overlapMs  = DEFAULT_OVERLAP_MS,
  hpCutoffHz = DEFAULT_HP_CUTOFF_HZ,
  ...rest
} = {}) {
  const empty = {
    envelope: [], windowSamples: 0, hopSamples: 0,
    fs: fs || 0, windowMs, overlapMs, peak: 0, mean: 0, hampel: null,
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

  // 1) Hampel + remoção de DC (mesmo tratamento que na calibração)
  const { clean, hampelStats } = preprocessWithStats(rawSignal, { fs, hpCutoffHz, ...rest });

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
    hampel: hampelStats,
  };
}