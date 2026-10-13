/**
 * Reintento automático: si queda algo tras una pasada con red (503, timeout),
 * antes nadie volvía a intentarlo hasta otro evento (volver la red, encolar
 * otra cosa, reabrir la app, el botón de sincronizar). Espera creciente.
 */
export const RETRY_BASE_MS = 15_000;
export const RETRY_MAX_MS = 300_000;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_BASE_MS;

/** Programa (o cancela, si no queda nada) la siguiente pasada */
export function scheduleRetry(remaining: number, run: () => void): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (remaining === 0 || typeof window === 'undefined') {
    retryDelay = RETRY_BASE_MS;
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    run();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}
