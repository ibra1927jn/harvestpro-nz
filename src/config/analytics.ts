import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';

/**
 * AUDIT P-1: Lazy-load PostHog to remove 432KB from initial bundle.
 * PostHog is dynamically imported on first use (initPostHog call).
 * All tracking methods safely no-op until PostHog is loaded.
 */
let posthogInstance: typeof import('posthog-js').default | null = null;
let posthogLoading: Promise<void> | null = null;

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
   * Identify user (set user properties)
   */
  identify(userId: string, properties?: Record<string, unknown>) {
    posthogInstance?.identify(userId, properties);
  },

  /**
   * Track bucket scan
   */
  trackBucketScanned(pickerId: string, qualityGrade: string) {
    posthogInstance?.capture('bucket_scanned', {
      picker_id: pickerId,
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
   * Track picker check-in
   */
  trackCheckIn(pickerId: string) {
    posthogInstance?.capture('picker_check_in', {
      picker_id: pickerId,
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
   * Track feature usage
   */
  trackFeature(featureName: string, properties?: Record<string, unknown>) {
    posthogInstance?.capture(`feature_used:${featureName}`, properties);
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
   * Set user properties (for segmentation)
   */
  setUserProperties(properties: Record<string, unknown>) {
    posthogInstance?.people?.set(properties);
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
   * Track row assignment changes
   */
  trackRowAssignment(pickerId: string, rowNumber: number) {
    posthogInstance?.capture('row_assigned', {
      picker_id: pickerId,
      row_number: rowNumber,
    });
  },
};

