let lastTick = 0

/** Short tap vibration — debounced so nested handlers don't double-fire. */
export function tickHaptic(durationMs = 10): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - lastTick < 40) return
  lastTick = now
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(durationMs)
    }
  } catch {
    /* unsupported / denied */
  }
}
