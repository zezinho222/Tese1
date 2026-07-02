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