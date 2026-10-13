import { logger } from '@/utils/logger';

/**
 * Sentry diferido: el SDK (@sentry/react, ~145 KB gzip) solo se descarga cuando
 * initSentry() se llama (tras la primera interacción o en idle, ver index.tsx) y
 * solo si hay DSN. Antes de eso, usuario/contexto/breadcrumbs/errores se guardan
 * en una cola acotada y se reenvían al inicializar; así los errores de arranque
 * no se pierden. Sin DSN (o en desarrollo) nunca se descarga el SDK.
 */

type SentryType = typeof import('@sentry/react');
type PendingCall = (S: SentryType) => void;

let Sentry: SentryType | null = null;
let initPromise: Promise<void> | null = null;
const pending: PendingCall[] = [];
// Cola acotada: un bucle de errores antes de init no debe crecer sin límite
export const MAX_PENDING_SENTRY_CALLS = 50;

let earlyHandlersInstalled = false;

/** Sentry está activo en este build (hay DSN y no es desarrollo). */
export function isSentryEnabled(): boolean {
  return import.meta.env.MODE !== 'development' && Boolean(import.meta.env.VITE_SENTRY_DSN);
}

/** Ejecuta ya si el SDK está cargado; si no, lo encola (o lo descarta si Sentry está desactivado). */
function withSentry(call: PendingCall): void {
  if (Sentry) {
    call(Sentry);
    return;
  }
  if (!isSentryEnabled()) return;
  if (pending.length < MAX_PENDING_SENTRY_CALLS) pending.push(call);
}

function onEarlyError(event: ErrorEvent): void {
  const err = event.error instanceof Error ? event.error : new Error(String(event.message));
  void captureSentryError(err, { phase: 'startup' });
}

function onEarlyRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void captureSentryError(err, { phase: 'startup' });
}

/**
 * Captura errores globales del arranque mientras el SDK aún no está cargado.
 * Se desinstala en initSentry (el SDK instala sus propios handlers).
 */
export function installEarlyErrorCapture(): void {
  if (earlyHandlersInstalled || !isSentryEnabled() || typeof window === 'undefined') return;
  earlyHandlersInstalled = true;
  window.addEventListener('error', onEarlyError);
  window.addEventListener('unhandledrejection', onEarlyRejection);
}

function removeEarlyErrorCapture(): void {
  if (!earlyHandlersInstalled) return;
  earlyHandlersInstalled = false;
  window.removeEventListener('error', onEarlyError);
  window.removeEventListener('unhandledrejection', onEarlyRejection);
}

/** Nº de llamadas en cola (para tests/diagnóstico). */
export function pendingSentryCalls(): number {
  return pending.length;
}

export function initSentry(): Promise<void> {
  if (!initPromise) initPromise = loadAndInit();
  return initPromise;
}

async function loadAndInit(): Promise<void> {
  if (!isSentryEnabled()) {
    pending.length = 0;
    if (import.meta.env.MODE === 'development') logger.info('🔍 Sentry disabled in development mode');
    else logger.warn('⚠️ VITE_SENTRY_DSN not configured. Sentry will not track errors.');
    return;
  }
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  let S: SentryType;
  try {
    S = await import('@sentry/react');
  } catch (err) {
    // Sin red (offline) o chunk no disponible: se reintenta en la próxima llamada
    initPromise = null;
    logger.warn('⚠️ @sentry/react failed to load:', err);
    return;
  }

  S.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `harvestpro-nz@${import.meta.env.VITE_APP_VERSION || '9.9.0'}`,
    integrations: [
      S.browserTracingIntegration(),
      S.replayIntegration({
        // SEC-2 FIX: maskAllText + blockAllMedia protect worker PII (NZ Privacy Act 2020)
        // Worker names, wages, picker IDs and orchard data will NOT appear in replays.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (event.request) delete event.request.cookies;
      if (event.exception?.values?.[0]?.value?.includes('Invalid login credentials')) return null;
      if (event.contexts?.storage) delete event.contexts.storage;
      return event;
    },
    ignoreErrors: [
      'top.GLOBALS',
      'chrome-extension://',
      'moz-extension://',
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      'Invalid login credentials',
      'User not found',
    ],
  });
  Sentry = S;
  removeEarlyErrorCapture();
  // Reenviar lo que se acumuló antes de cargar el SDK (errores de arranque incluidos)
  for (const call of pending.splice(0)) call(S);
  logger.info('✅ Sentry initialized (lazy):', import.meta.env.MODE);
}

export async function setSentryUser(user: { id: string; email?: string; role?: string }) {
  withSentry(S => S.setUser({ id: user.id, email: user.email, role: user.role }));
}

export async function clearSentryUser() {
  withSentry(S => S.setUser(null));
}

export async function setSentryContext(context: Record<string, unknown>) {
  withSentry(S => S.setContext('app_context', context));
}

export async function captureSentryError(error: Error, context?: Record<string, unknown>) {
  withSentry(S => {
    if (context) S.setContext('error_context', context);
    S.captureException(error);
  });
}

export async function addSentryBreadcrumb(message: string, data?: Record<string, unknown>) {
  // timestamp del momento real, no del reenvío
  const timestamp = Date.now() / 1000;
  withSentry(S =>
    S.addBreadcrumb({
      message,
      data,
      level: 'info',
      timestamp,
    })
  );
}
