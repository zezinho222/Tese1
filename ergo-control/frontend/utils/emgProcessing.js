/**
 * RMS Envelope com janela deslizante
 * @param {number[]} signal - Sinal EMG raw
 * @param {number} windowSize - Tamanho da janela (ex: 50 amostras a 1000Hz = 50ms)
 * @returns {number[]} - Envelope RMS
 */
export function rmsEnvelope(signal, windowSize) {
  const result = [];
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const slice = signal.slice(i, i + windowSize);
    const meanSquare = slice.reduce((sum, val) => sum + val * val, 0) / windowSize;
    result.push(Math.sqrt(meanSquare));
  }
  return result;
}

/**
 * Calcula o MVC a partir do envelope RMS
 * @param {number[]} signal - Sinal EMG raw
 * @param {number} windowSize - Tamanho da janela (default: 50)
 * @returns {{ mvc: number, envelope: number[] }}
 */
export function calculateMVC(signal, windowSize = 50) {
  if (!signal || signal.length < windowSize) {
    return { mvc: 0, envelope: [] };
  }
  const envelope = rmsEnvelope(signal, windowSize);
  const mvc = Math.max(...envelope);
  return { mvc, envelope };
}

/**
 * Normaliza um valor EMG pelo MVC
 * @param {number} value - Valor EMG raw
 * @param {number} mvc - Valor MVC de referência
 * @returns {number} - Percentagem de 0 a 100 (clampada)
 */
export function normalizeByMVC(value, mvc) {
  if (!mvc || mvc === 0) return 0;
  return Math.min(100, Math.max(0, (value / mvc) * 100));
}

// ─── Envelope RMS da sessão (janela + overlap escolhidos pelo utilizador) ─────

/** Valores por omissão da janela e do overlap, em milissegundos. */
export const DEFAULT_WINDOW_MS  = 125;
export const DEFAULT_OVERLAP_MS = 6.25;

/**
 * Envelope RMS de uma sessão completa, com janela deslizante e salto (hop).
 *
 * Equivalente ao cálculo em MATLAB:
 *   w   = round(w_rms * fs)
 *   hop = round((w_rms - o_rms) * fs)
 *   idx = 1
 *   while (idx + w - 1) <= N
 *       segment  = norm_signal(idx : idx + w - 1)
 *       rms_vals(end+1) = sqrt(mean(segment.^2))
 *       idx = idx + hop
 *   end
 *
 * O sinal é primeiro normalizado pelo MVC (norm_signal = raw / mvc), por isso
 * o envelope vem já em fração do MVC (1.0 = 100% MVC).
 *
 * @param {number[]} rawSignal  - amostras EMG em bruto, tal como recolhidas
 * @param {object}   opts
 * @param {number}   opts.mvc        - valor de MVC da calibração
 * @param {number}   opts.fs         - frequência de amostragem em Hz
 * @param {number}   opts.windowMs   - largura da janela em ms (default 125)
 * @param {number}   opts.overlapMs  - overlap em ms (default 6.25)
 * @returns {{
 *   envelope: number[], windowSamples: number, hopSamples: number,
 *   fs: number, windowMs: number, overlapMs: number,
 *   peak: number, mean: number
 * }}
 */
export function computeRmsEnvelope(rawSignal, {
  mvc,
  fs,
  windowMs  = DEFAULT_WINDOW_MS,
  overlapMs = DEFAULT_OVERLAP_MS,
} = {}) {
  const empty = {
    envelope: [], windowSamples: 0, hopSamples: 0,
    fs: fs || 0, windowMs, overlapMs, peak: 0, mean: 0,
  };

  if (!Array.isArray(rawSignal) || rawSignal.length === 0) return empty;
  if (!fs || fs <= 0) return empty;

  // nº de amostras da janela = largura da janela (s) × freq
  const w = Math.round((windowMs / 1000) * fs);
  // nº de amostras do salto = (largura da janela − overlap) (s) × freq
  const hop = Math.round(((windowMs - overlapMs) / 1000) * fs);

  if (w < 1 || hop < 1 || rawSignal.length < w) {
    return { ...empty, windowSamples: w, hopSamples: hop };
  }

  // normalizar sinal = sinal raw / mvc  (sem MVC válido fica em bruto)
  const scale = mvc && mvc !== 0 ? 1 / mvc : 1;

  const N = rawSignal.length;
  const envelope = [];
  for (let idx = 0; idx + w - 1 < N; idx += hop) {
    let sumSq = 0;
    for (let k = idx; k < idx + w; k++) {
      const v = rawSignal[k] * scale;
      sumSq += v * v;
    }
    envelope.push(Math.sqrt(sumSq / w));
  }

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