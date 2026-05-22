import { logger } from '@/utils/logger';

/**
 * AUDIT P-1: Lazy Sentry — @sentry/react loaded dynamically after first render.
 * Removes the 432KB vendor-monitoring chunk from the critical JS path.
 *
 * Trade-off: errors that occur during initial page load (before Sentry loads)
 * won't be captured. Acceptable for a PWA where data integrity > load-time errors.
 */

type SentryType = typeof import('@sentry/react');
let Sentry: SentryType | null = null;
let sentryLoading: Promise<void> | null = null;

// ── PII scrubbing (NZ Privacy Act 2020 IPP 3) ────────────────────────────
// Sentry's default scrubber covers obvious keys but misses:
//   - NZ IRD numbers (###-###-### or #########)
//   - NZ bank accounts (##-####-#######-##[#])
//   - bare email addresses embedded in free-form error messages
//   - picker PII passed as breadcrumb `data`
// Patterns are conservative — we over-mask rather than risk leakage.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IRD_RE = /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/g;                 // 123-456-789
const NZ_BANK_RE = /\b\d{2}-\d{4}-\d{7}-\d{2,3}\b/g;             // 01-1234-1234567-00
const CARD_RE = /\b(?:\d[ -]?){13,16}\b/g;                        // conservative cc / long numeric

function scrubString(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  return s
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(IRD_RE, '[redacted-ird]')
    .replace(NZ_BANK_RE, '[redacted-bank]')
    .replace(CARD_RE, '[redacted-digits]');
}

const PII_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'ird',
  'ird_number',
  'bank',
  'bank_account',
  'account_number',
  'full_name',
  'name',
  'address',
  'date_of_birth',
  'dob',
  'picker_id',
]);

function scrubObject(obj: unknown, depth = 0): void {
  if (depth > 6 || !obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    const rec = obj as Record<string, unknown>;
    if (PII_KEYS.has(k.toLowerCase())) {
      rec[k] = '[redacted]';
      continue;
    }
    const v = rec[k];
    if (typeof v === 'string') {
      rec[k] = scrubString(v);
    } else if (v && typeof v === 'object') {
      scrubObject(v, depth + 1);
    }
  }
}

// Event shape loosely typed so we do not pin to a specific @sentry/react
// minor version. Sentry ErrorEvent properties referenced here are all
// stable across 7.x / 8.x.
interface SentryEventShape {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  user?: Record<string, unknown>;
}

function scrubPII(event: SentryEventShape): void {
  if (typeof event.message === 'string') event.message = scrubString(event.message) as string;
  const exc = event.exception?.values?.[0];
  if (exc && typeof exc.value === 'string') exc.value = scrubString(exc.value) as string;
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) {
      if (typeof b.message === 'string') b.message = scrubString(b.message) as string;
      if (b.data) scrubObject(b.data);
    }
  }
  if (event.extra) scrubObject(event.extra);
  if (event.contexts) scrubObject(event.contexts);
  if (event.user) scrubObject(event.user);
}

async function getSentry(): Promise<SentryType | null> {
  if (Sentry) return Sentry;
  if (!sentryLoading) {
    sentryLoading = import('@sentry/react')
      .then(mod => {
        Sentry = mod;
      })
      .catch(err => {
        logger.warn('⚠️ @sentry/react failed to load:', err);
      });
  }
  await sentryLoading;
  return Sentry;
}

export async function initSentry(): Promise<void> {
  if (import.meta.env.MODE === 'development') {
    logger.info('🔍 Sentry disabled in development mode');
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    logger.warn('⚠️ VITE_SENTRY_DSN not configured. Sentry will not track errors.');
    return;
  }

  const S = await getSentry();
  if (!S) return;

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
      scrubPII(event);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (typeof breadcrumb.message === 'string') {
        breadcrumb.message = scrubString(breadcrumb.message) as string;
      }
      if (breadcrumb.data) scrubObject(breadcrumb.data);
      return breadcrumb;
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
  logger.info('✅ Sentry initialized (lazy):', import.meta.env.MODE);
}

export async function setSentryUser(user: { id: string; email?: string; role?: string }) {
  const S = await getSentry();
  // Do not persist email on the user context — session replay could co-locate
  // it with a later event. Role is safe (non-identifying). id is the Supabase
  // auth uuid — opaque, acceptable.
  S?.setUser({ id: user.id, role: user.role });
}

export async function clearSentryUser() {
  const S = await getSentry();
  S?.setUser(null);
}

export async function setSentryContext(context: Record<string, unknown>) {
  const S = await getSentry();
  S?.setContext('app_context', context);
}

export async function captureSentryError(error: Error, context?: Record<string, unknown>) {
  const S = await getSentry();
  if (context) S?.setContext('error_context', context);
  S?.captureException(error);
}

export async function addSentryBreadcrumb(message: string, data?: Record<string, unknown>) {
  const S = await getSentry();
  S?.addBreadcrumb({
    message,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}
