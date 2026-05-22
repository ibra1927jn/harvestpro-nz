import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';

/**
 * AUDIT P-1: Lazy-load PostHog to remove 432KB from initial bundle.
 * PostHog is dynamically imported on first use (initPostHog call).
 * All tracking methods safely no-op until PostHog is loaded.
 */
let posthogInstance: typeof import('posthog-js').default | null = null;
let posthogLoading: Promise<void> | null = null;

// ── PII scrubbing (NZ Privacy Act 2020 IPP 3) ────────────────────────────
// picker_id + date + bucket count = wage data = PII under IPP 3. Sending
// raw picker_id to PostHog means a 3rd party holds worker-linkable records.
// We pseudonymize with a salted FNV-1a hash so cross-event aggregation
// still works (same picker → same pseudonym) without letting PostHog
// resolve back to a real worker.
//
// Using FNV-1a (sync, no async contagion in track calls). 64-bit output
// via two parallel 32-bit accumulators — collision risk for <10M pickers
// across our customer base is negligible for analytics purposes.
function hashPickerId(pickerId: string): string {
  if (!pickerId) return '';
  const salt = import.meta.env.VITE_ANALYTICS_PSEUDONYM_SALT || 'harvestpro-default-salt-rotate-in-prod';
  const s = `${salt}:${pickerId}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 0x9e3779b9), 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `pid_${hex1}${hex2}`;
}

// Keys that must never reach PostHog regardless of caller intent.
const BLOCKED_PII_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'ird',
  'ird_number',
  'bank',
  'bank_account',
  'bank_number',
  'account_number',
  'full_name',
  'name',
  'first_name',
  'last_name',
  'address',
  'date_of_birth',
  'dob',
]);

function scrubProperties<T extends Record<string, unknown> | undefined>(props: T): T {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (BLOCKED_PII_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * Initialize PostHog for product analytics (LAZY LOADED)
 *
 * FREE TIER: 1 million events/month
 */
export async function initPostHog() {
  // Only initialize in staging and production
  if (import.meta.env.MODE === 'development') {
    logger.info('📊 PostHog disabled in development mode');
    return;
  }

  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    logger.warn('⚠️ VITE_POSTHOG_KEY not configured. Analytics will not track events.');
    return;
  }

  // Dynamic import — removes posthog-js from initial bundle
  if (!posthogLoading) {
    posthogLoading = import('posthog-js')
      .then(mod => {
        posthogInstance = mod.default;
        posthogInstance.init(apiKey, {
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
        logger.info('✅ PostHog initialized (lazy):', import.meta.env.MODE);
      })
      .catch(err => {
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
   * Identify user (set user properties).
   * PII keys (email, IRD, bank, name, phone, address, DOB) are dropped before
   * they reach PostHog. Pass non-identifying dimensions only (role, orchard).
   */
  identify(userId: string, properties?: Record<string, unknown>) {
    posthogInstance?.identify(userId, scrubProperties(properties));
  },

  /**
   * Track bucket scan. picker_id is hashed — see hashPickerId() above.
   */
  trackBucketScanned(pickerId: string, qualityGrade: string) {
    posthogInstance?.capture('bucket_scanned', {
      picker: hashPickerId(pickerId),
      quality_grade: qualityGrade,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track user login
   */
  trackLogin(role: string, orchardId?: string) {
    posthogInstance?.capture('user_login', {
      role,
      orchard_id: orchardId,
    });
  },

  /**
   * Track logout
   */
  trackLogout() {
    posthogInstance?.capture('user_logout');
    posthogInstance?.reset();
  },

  /**
   * Track picker check-in. picker_id hashed.
   */
  trackCheckIn(pickerId: string) {
    posthogInstance?.capture('picker_check_in', {
      picker: hashPickerId(pickerId),
      timestamp: nowNZST(),
    });
  },

  /**
   * Track offline sync
   */
  trackSync(itemCount: number, duration: number, success: boolean) {
    posthogInstance?.capture('offline_sync', {
      item_count: itemCount,
      duration_ms: duration,
      success,
    });
  },

  /**
   * Track broadcast sent
   */
  trackBroadcast(recipientCount: number, priority: string) {
    posthogInstance?.capture('broadcast_sent', {
      recipient_count: recipientCount,
      priority,
    });
  },

  /**
   * Track DLQ error
   */
  trackDLQError(errorType: string, severity: string) {
    posthogInstance?.capture('dlq_error', {
      error_type: errorType,
      severity,
    });
  },

  /**
   * Track feature usage. Caller-supplied properties are scrubbed of PII keys.
   */
  trackFeature(featureName: string, properties?: Record<string, unknown>) {
    posthogInstance?.capture(`feature_used:${featureName}`, scrubProperties(properties));
  },

  /**
   * Track page view manually (if needed)
   */
  trackPageView(pageName: string) {
    posthogInstance?.capture('$pageview', {
      page: pageName,
    });
  },

  /**
   * Set user properties (for segmentation). PII keys are stripped.
   */
  setUserProperties(properties: Record<string, unknown>) {
    posthogInstance?.people?.set(scrubProperties(properties));
  },

  /**
   * Track timesheet approval/rejection
   */
  trackTimesheetAction(action: 'approve' | 'reject', attendanceId: string) {
    posthogInstance?.capture('timesheet_action', {
      action,
      attendance_id: attendanceId,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track payroll export
   */
  trackPayrollExport(format: string, pickerCount: number) {
    posthogInstance?.capture('payroll_exported', {
      format,
      picker_count: pickerCount,
      timestamp: nowNZST(),
    });
  },

  /**
   * Track conflict resolution
   */
  trackConflictResolved(conflictType: string, resolution: string) {
    posthogInstance?.capture('conflict_resolved', {
      conflict_type: conflictType,
      resolution,
    });
  },

  /**
   * Track row assignment changes. picker_id hashed.
   */
  trackRowAssignment(pickerId: string, rowNumber: number) {
    posthogInstance?.capture('row_assigned', {
      picker: hashPickerId(pickerId),
      row_number: rowNumber,
    });
  },
};

// Export lazy posthog instance for advanced usage
export const getPosthog = () => posthogInstance;
