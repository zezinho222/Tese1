// O alerta só é confirmado depois de o valor se manter acima do limite durante debounceMs
export function createAlertTracker(debounceMs = 700) {
  let aboveSince = null;
  let counted = false;

  return {

    // Retorna true se o alerta for confirmado
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
