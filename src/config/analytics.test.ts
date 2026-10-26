/**
 * Smoke tests for config/analytics.ts — verify all methods exist and are callable
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
    people: { set: vi.fn() },
  },
}));

vi.mock('@/utils/nzst', () => ({
  nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { analytics, initPostHog } from './analytics';

describe('analytics module', () => {
  it('initPostHog does not throw', () => {
    expect(() => initPostHog()).not.toThrow();
  });

  it('analytics.identify is a function', () => {
    expect(typeof analytics.identify).toBe('function');
    expect(() => analytics.identify('u1')).not.toThrow();
  });

  it('analytics.trackBucketScanned is callable', () => {
    expect(() => analytics.trackBucketScanned('A')).not.toThrow();
  });

  it('analytics.trackLogin is callable', () => {
    expect(() => analytics.trackLogin('manager', 'o1')).not.toThrow();
  });

  it('analytics.trackLogout is callable', () => {
    expect(() => analytics.trackLogout()).not.toThrow();
  });

  it('analytics.trackCheckIn is callable', () => {
    expect(() => analytics.trackCheckIn()).not.toThrow();
  });

  it('analytics.trackSync is callable', () => {
    expect(() => analytics.trackSync(5, 1500, true)).not.toThrow();
  });

  it('analytics.trackBroadcast is callable', () => {
    expect(() => analytics.trackBroadcast(10, 'high')).not.toThrow();
  });

  it('analytics.trackDLQError is callable', () => {
    expect(() => analytics.trackDLQError('TIMEOUT', 'high')).not.toThrow();
  });

  it('analytics.trackFeature is callable', () => {
    expect(() => analytics.trackFeature('export')).not.toThrow();
  });

  it('analytics.trackPageView is callable', () => {
    expect(() => analytics.trackPageView('dashboard')).not.toThrow();
  });

  it('analytics.setUserProperties is callable', () => {
    expect(() => analytics.setUserProperties({ role: 'manager' })).not.toThrow();
  });

  it('analytics.trackTimesheetAction is callable', () => {
    expect(() => analytics.trackTimesheetAction('approve', 'att-1')).not.toThrow();
  });

  it('analytics.trackPayrollExport is callable', () => {
    expect(() => analytics.trackPayrollExport('csv', 25)).not.toThrow();
  });

  it('analytics.trackConflictResolved is callable', () => {
    expect(() => analytics.trackConflictResolved('duplicate', 'keep_newer')).not.toThrow();
  });

  it('analytics.trackRowAssignment is callable', () => {
    expect(() => analytics.trackRowAssignment(5)).not.toThrow();
  });
});

describe('cola de PostHog diferido', () => {
  it('sin clave descarta los eventos (no se encolan ni se descarga posthog-js)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const m = await import('./analytics');
    m.analytics.trackLogin('runner');
    expect(m.pendingAnalyticsCalls()).toBe(0);
    vi.unstubAllEnvs();
  });

  it('con clave encola antes de init y envía al inicializar', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const ph = (await import('posthog-js')).default;
    vi.mocked(ph.capture).mockClear();
    const m = await import('./analytics');
    m.analytics.trackLogin('runner', 'o1');
    m.analytics.trackWebVital({
      name: 'LCP',
      value: 1200,
      rating: 'good',
      delta: 1200,
      id: 'v1',
      navigationType: 'navigate',
    });
    expect(m.pendingAnalyticsCalls()).toBe(2);
    expect(ph.capture).not.toHaveBeenCalled();

    await m.initPostHog();

    expect(ph.init).toHaveBeenCalledWith('phc_test', expect.any(Object));
    expect(ph.capture).toHaveBeenCalledWith('user_login', { role: 'runner', orchard_id: 'o1' });
    expect(ph.capture).toHaveBeenCalledWith(
      'web_vital',
      expect.objectContaining({ name: 'LCP', value: 1200 })
    );
    expect(m.pendingAnalyticsCalls()).toBe(0);
    vi.unstubAllEnvs();
  });
});

describe('datos personales (NZ Privacy Act)', () => {
  it('no manda email, picker_id ni IRD a PostHog', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const ph = (await import('posthog-js')).default;
    vi.mocked(ph.capture).mockClear();
    vi.mocked(ph.identify).mockClear();
    const m = await import('./analytics');
    await m.initPostHog();

    m.analytics.identify('uuid-1', { role: 'manager', orchard_id: 'o1', email: 'a@test.com' });
    m.analytics.trackBucketScanned('A');
    m.analytics.trackCheckIn();
    m.analytics.trackRowAssignment(5);
    m.analytics.trackFeature('x', { picker_id: 'p1', note: 'IRD 123-456-789 de b@c.nz' });
    m.analytics.setUserProperties({ full_name: 'Ana', role: 'runner' });

    expect(ph.identify).toHaveBeenCalledWith('uuid-1', { role: 'manager', orchard_id: 'o1' });
    const sent = JSON.stringify([
      vi.mocked(ph.capture).mock.calls,
      vi.mocked(ph.identify).mock.calls,
      vi.mocked(ph.people.set).mock.calls,
    ]);
    for (const secreto of ['a@test.com', 'picker_id', 'p1', '123-456-789', 'b@c.nz', 'Ana']) {
      expect(sent).not.toContain(secreto);
    }
    vi.unstubAllEnvs();
  });
});
