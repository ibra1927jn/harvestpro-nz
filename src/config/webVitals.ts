/**
 * Web Vitals — Performance monitoring integration
 *
 * Reports Core Web Vitals (LCP, FID, CLS, FCP, TTFB, INP) to PostHog
 * for real-user performance monitoring (RUM) in production.
 *
 * @see https://web.dev/vitals/
 * @module config/webVitals
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { analytics } from './analytics';

/** Envía una métrica a PostHog (encolada hasta que PostHog cargue; sin clave se descarta) */
function sendToPostHog(metric: Metric) {
  // Solo reportar en produccion para evitar datos ruidosos en dev
  if (import.meta.env.DEV) return;
  analytics.trackWebVital({
    name: metric.name, // e.g. "LCP", "CLS"
    value: metric.value,
    rating: metric.rating, // "good" | "needs-improvement" | "poor"
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
  });
}

/**
 * Initialize web vitals monitoring.
 * Call this once in your app entry point (main.tsx).
 *
 * Reports:
 * - LCP (Largest Contentful Paint) → loading performance
 * - CLS (Cumulative Layout Shift) → visual stability
 * - INP (Interaction to Next Paint) → input responsiveness
 * - FCP (First Contentful Paint) → perceived load speed
 * - TTFB (Time to First Byte) → server response time
 */
export function initWebVitals() {
  onLCP(sendToPostHog);
  onCLS(sendToPostHog);
  onINP(sendToPostHog);
  onFCP(sendToPostHog);
  onTTFB(sendToPostHog);
}
