// Calcula o envelope RMS com janela deslizante
function rmsEnvelope(signal, windowSize) {
  const result = [];
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const slice = signal.slice(i, i + windowSize);
    const meanSquare = slice.reduce((sum, val) => sum + val * val, 0) / windowSize;
    result.push(Math.sqrt(meanSquare));
  }
  return result;
}

// Calcula o MVC e o envelope RMS
export function calculateMVC(signal, windowSize = 50) {
  if (!signal || signal.length < windowSize) {
    return { mvc: 0, envelope: [] };
  }
  const envelope = rmsEnvelope(signal, windowSize);
  const mvc = Math.max(...envelope);
  return { mvc, envelope };
}

//Envelope RMS da sessão (janela + overlap escolhidos pelo utilizador)

// Valores default da janela e do overlap, em ms.
export const DEFAULT_WINDOW_MS  = 125;
export const DEFAULT_OVERLAP_MS = 6.25;

// Envelope RMS de uma sessão completa, com janela deslizante e salto (hop).
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
  const w = Math.round((windowMs / 1000) * fs); // divido por 1000 para converter ms em s
  // nº de amostras do salto = (largura da janela − overlap) (s) × freq
  const hop = Math.round(((windowMs - overlapMs) / 1000) * fs); // divido por 1000 para converter ms em s

  if (w < 1 || hop < 1 || rawSignal.length < w) {
    return { ...empty, windowSamples: w, hopSamples: hop };
  }

  // normalizar sinal = sinal raw / mvc
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