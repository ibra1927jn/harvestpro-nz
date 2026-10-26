import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { scrubProperties } from '@/utils/piiScrub';

/**
 * PostHog diferido: posthog-js solo se descarga en initPostHog() (tras la primera
 * interacción o en idle) y solo si hay VITE_POSTHOG_KEY. Los eventos anteriores se
 * encolan (cola acotada) y se envían al inicializar; sin clave se descartan.
 */
type PostHog = typeof import('posthog-js').default;
type PendingCall = (ph: PostHog) => void;

let posthogInstance: PostHog | null = null;
let posthogLoading: Promise<void> | null = null;
const pending: PendingCall[] = [];
export const MAX_PENDING_ANALYTICS_CALLS = 100;

/** Analítica activa en este build (hay clave y no es desarrollo). */
export function isAnalyticsEnabled(): boolean {
  return import.meta.env.MODE !== 'development' && Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

function withPostHog(call: PendingCall): void {
  if (posthogInstance) {
    call(posthogInstance);
    return;
  }
  if (!isAnalyticsEnabled()) return;
  if (pending.length < MAX_PENDING_ANALYTICS_CALLS) pending.push(call);
}

/**
 * Las propiedades se evalúan al llamar (timestamps reales), no al reenviar.
 * NZ Privacy Act: nada de email, IRD, cuenta bancaria, nombres ni picker_id hacia
 * PostHog; scrubProperties quita esas claves y limpia los textos.
 */
function capture(event: string, properties?: Record<string, unknown>): void {
  const clean = scrubProperties(properties);
  withPostHog(ph => ph.capture(event, clean));
}

/** Nº de eventos en cola (tests/diagnóstico). */
export function pendingAnalyticsCalls(): number {
  return pending.length;
}

/**
 * Initialize PostHog for product analytics (LAZY LOADED)
 *
 * FREE TIER: 1 million events/month
 */
export async function initPostHog() {
  // Only initialize in staging and production
  if (import.meta.env.MODE === 'development') {
    pending.length = 0;
    logger.info('📊 PostHog disabled in development mode');
    return;
  }

  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    pending.length = 0;
    logger.warn('⚠️ VITE_POSTHOG_KEY not configured. Analytics will not track events.');
    return;
  }

  // Dynamic import — removes posthog-js from initial bundle
  if (!posthogLoading) {
    posthogLoading = import('posthog-js')
      .then(mod => {
        const ph = mod.default;
        ph.init(apiKey, {
          api_host: host,
          autocapture: false,
          capture_pageview: true,
          capture_pageleave: true,
          loaded: ph => {
            if (import.meta.env.MODE === 'development') {
              ph.opt_out_capturing();
            }
          },
        });
        posthogInstance = ph;
        for (const call of pending.splice(0)) call(ph);
        logger.info('✅ PostHog initialized (lazy):', import.meta.env.MODE);
      })
      .catch(err => {
        // Offline / chunk no disponible: permitir reintento
        posthogLoading = null;
        logger.warn('⚠️ PostHog failed to load:', err);
      });
  }
  await posthogLoading;
}

/**
 * Analytics service - Centralized event tracking
 */
export const analytics = {
  /**
   * Identify user (set user properties)
   */
  identify(userId: string, properties?: Record<string, unknown>) {
    // userId debe ser el uuid opaco de auth; las propiedades personales se quitan
    const clean = scrubProperties(properties);
    withPostHog(ph => ph.identify(userId, clean));
  },

  /**
   * Track bucket scan (sin picker_id: el id del trabajador no sale hacia PostHog)
   */
  trackBucketScanned(qualityGrade: string) {
    capture('bucket_scanned', {
      quality_grade: qualityGrade,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track user login
   */
  trackLogin(role: string, orchardId?: string) {
    capture('user_login', {
      role,
      orchard_id: orchardId,
    });
  },

  /**
   * Track logout
   */
  trackLogout() {
    capture('user_logout');
    withPostHog(ph => ph.reset());
  },

  /**
   * Track picker check-in (sin picker_id: el recuento basta para producto)
   */
  trackCheckIn() {
    capture('picker_check_in', {
      timestamp: nowNZST(),
    });
  },

  /**
   * Track offline sync
   */
  trackSync(itemCount: number, duration: number, success: boolean) {
    capture('offline_sync', {
      item_count: itemCount,
      duration_ms: duration,
      success,
    });
  },

  /**
   * Track broadcast sent
   */
  trackBroadcast(recipientCount: number, priority: string) {
    capture('broadcast_sent', {
      recipient_count: recipientCount,
      priority,
    });
  },

  /**
   * Track DLQ error
   */
  trackDLQError(errorType: string, severity: string) {
    capture('dlq_error', {
      error_type: errorType,
      severity,
    });
  },

  /**
   * Track feature usage
   */
  trackFeature(featureName: string, properties?: Record<string, unknown>) {
    capture(`feature_used:${featureName}`, properties);
  },

  /**
   * Track page view manually (if needed)
   */
  trackPageView(pageName: string) {
    capture('$pageview', {
      page: pageName,
    });
  },

  /**
   * Set user properties (for segmentation)
   */
  setUserProperties(properties: Record<string, unknown>) {
    const clean = scrubProperties(properties) ?? {};
    withPostHog(ph => ph.people?.set(clean));
  },

  /**
   * Track timesheet approval/rejection
   */
  trackTimesheetAction(action: 'approve' | 'reject', attendanceId: string) {
    capture('timesheet_action', {
      action,
      attendance_id: attendanceId,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track payroll export
   */
  trackPayrollExport(format: string, pickerCount: number) {
    capture('payroll_exported', {
      format,
      picker_count: pickerCount,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track conflict resolution
   */
  trackConflictResolved(conflictType: string, resolution: string) {
    capture('conflict_resolved', {
      conflict_type: conflictType,
      resolution,
    });
  },

  /**
   * Core Web Vitals (RUM). Antes importaba posthog-js directamente y lo
   * descargaba aunque no hubiera clave.
   */
  trackWebVital(metric: {
    name: string;
    value: number;
    rating: string;
    delta: number;
    id: string;
    navigationType: string;
  }) {
    capture('web_vital', { ...metric });
  },

  /**
   * Track row assignment changes (sin picker_id)
   */
  trackRowAssignment(rowNumber: number) {
    capture('row_assigned', {
      row_number: rowNumber,
    });
  },
};

