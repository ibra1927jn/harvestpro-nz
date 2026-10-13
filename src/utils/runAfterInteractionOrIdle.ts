/**
 * Ejecuta `cb` una sola vez, cuando ocurra lo primero de:
 *  - la primera interacción del usuario (pointerdown / keydown / touchstart), o
 *  - `fallbackMs` después del evento `load` (si el usuario no toca nada).
 * Después espera a que el hilo principal esté libre (requestIdleCallback).
 *
 * Sirve para cargar código no crítico (Sentry, PostHog, web-vitals) sin competir
 * con el JS de la primera pantalla por el ancho de banda en 3G.
 * Devuelve una función para cancelar.
 */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export interface RunAfterOptions {
  /** Margen tras `load` si no hay interacción (ms). */
  fallbackMs?: number;
  /** Tiempo máximo de espera de requestIdleCallback (ms). */
  idleTimeoutMs?: number;
  win?: Window;
}

export function runAfterInteractionOrIdle(cb: () => void, opts: RunAfterOptions = {}): () => void {
  const win = opts.win ?? window;
  const fallbackMs = opts.fallbackMs ?? 10_000;
  const idleTimeoutMs = opts.idleTimeoutMs ?? 2_000;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    for (const ev of INTERACTION_EVENTS) win.removeEventListener(ev, trigger, true);
    win.removeEventListener('load', armFallback);
    if (timer !== undefined) clearTimeout(timer);
  };

  function trigger() {
    if (done) return;
    done = true;
    cleanup();
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(() => cb(), { timeout: idleTimeoutMs });
    } else {
      setTimeout(cb, 0);
    }
  }

  function armFallback() {
    if (!done) timer = setTimeout(trigger, fallbackMs);
  }

  for (const ev of INTERACTION_EVENTS) {
    win.addEventListener(ev, trigger, { capture: true, passive: true, once: true });
  }
  if (win.document.readyState === 'complete') armFallback();
  else win.addEventListener('load', armFallback, { once: true });

  return () => {
    done = true;
    cleanup();
  };
}
