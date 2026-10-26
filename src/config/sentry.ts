import { logger } from '@/utils/logger';
import { scrubText, scrubValue } from '@/utils/piiScrub';

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

/** Lo que tocamos de un evento de Sentry (forma estable entre versiones del SDK). */
interface SentryEventLike {
  message?: string;
  transaction?: string;
  logentry?: unknown;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<SentryBreadcrumbLike>;
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  request?: { cookies?: unknown; url?: string; query_string?: unknown; data?: unknown; headers?: unknown };
  user?: { id?: string | number; role?: unknown } & Record<string, unknown>;
}

interface SentryBreadcrumbLike {
  message?: string;
  data?: unknown;
}

/**
 * Quita datos personales (email, IRD, cuenta bancaria, picker_id, nombres) de un
 * breadcrumb antes de guardarlo. Muta y devuelve el mismo objeto (contrato de Sentry).
 */
export function scrubSentryBreadcrumb<T extends SentryBreadcrumbLike>(breadcrumb: T): T {
  if (typeof breadcrumb.message === 'string') breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data !== undefined) breadcrumb.data = scrubValue(breadcrumb.data);
  return breadcrumb;
}

/**
 * NZ Privacy Act: ningún evento sale hacia Sentry con email, IRD, cuenta bancaria
 * o ids de picker. Se limpian mensaje, excepciones, breadcrumbs, extra, contextos,
 * etiquetas y la petición; del usuario solo quedan el id opaco y el rol.
 */
export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  if (typeof event.message === 'string') event.message = scrubText(event.message);
  if (typeof event.transaction === 'string') event.transaction = scrubText(event.transaction);
  if (event.logentry !== undefined) event.logentry = scrubValue(event.logentry);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }
  for (const b of event.breadcrumbs ?? []) scrubSentryBreadcrumb(b);
  if (event.extra !== undefined) event.extra = scrubValue(event.extra);
  if (event.contexts !== undefined) event.contexts = scrubValue(event.contexts);
  if (event.tags !== undefined) event.tags = scrubValue(event.tags);
  if (event.request) {
    delete event.request.cookies;
    if (typeof event.request.url === 'string') event.request.url = scrubText(event.request.url);
    if (event.request.query_string !== undefined)
      event.request.query_string = scrubValue(event.request.query_string);
    if (event.request.data !== undefined) event.request.data = scrubValue(event.request.data);
    if (event.request.headers !== undefined)
      event.request.headers = scrubValue(event.request.headers);
  }
  if (event.user) {
    const { id, role } = event.user;
    event.user = role === undefined ? { id } : { id, role };
  }
  return event;
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
      if (event.exception?.values?.some(v => v.value?.includes('Invalid login credentials')))
        return null;
      if (event.contexts?.storage) delete event.contexts.storage;
      return scrubSentryEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubSentryBreadcrumb(breadcrumb);
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

/** Solo id opaco (uuid de auth) y rol: nunca email ni nombre (NZ Privacy Act). */
export async function setSentryUser(user: { id: string; role?: string }) {
  withSentry(S => S.setUser({ id: user.id, role: user.role }));
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
