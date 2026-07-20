/**
 * alertTracker.js
 * Conta episódios contínuos acima de um limite como um único alerta, em vez
 * de contar cada amostra individualmente (o que inflacionava o número com
 * ruído). Um alerta só é confirmado depois de o valor se manter acima do
 * limite durante pelo menos `debounceMs` — se descer antes disso, não conta.
 */
export function createAlertTracker(debounceMs = 700) {
  let aboveSince = null;
  let counted = false;

  return {
    /**
     * @param {boolean} isAbove - se a amostra atual está acima do limite
     * @param {number} now - timestamp atual (ms)
     * @returns {boolean} true exatamente uma vez por episódio, quando este
     *   atinge o debounce (é aqui que se deve incrementar o contador)
     */
    update(isAbove, now = Date.now()) {
      if (!isAbove) {
        aboveSince = null;
        counted = false;
        return false;
      }
      if (aboveSince == null) {
        aboveSince = now;
      }
      if (!counted && now - aboveSince >= debounceMs) {
        counted = true;
        return true;
      }
      return false;
    },
  };
}
