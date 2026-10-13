/**
 * Tests for config/sentry.ts — Sentry error tracking
 *
 * NOTE: sentry.ts uses lazy dynamic import via getSentry() — all exported
 * functions are async. Tests must await all calls.
 * The vi.mock for '@sentry/react' intercepts the dynamic import().
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  initSentry,
  setSentryUser,
  clearSentryUser,
  setSentryContext,
  captureSentryError,
  addSentryBreadcrumb,
} from './sentry';
import * as Sentry from '@sentry/react';

describe('initSentry', () => {
  it('returns early in development mode', async () => {
    await initSentry();
    // Sin VITE_SENTRY_DSN (tests/dev) no se inicializa
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});

describe('setSentryUser', () => {
  it('sets user with id, email, and role', async () => {
    await setSentryUser({ id: 'u1', email: 'a@test.com', role: 'manager' });
    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: 'u1',
      email: 'a@test.com',
      role: 'manager',
    });
  });
});

describe('clearSentryUser', () => {
  it('clears user context', async () => {
    await clearSentryUser();
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });
});

describe('setSentryContext', () => {
  it('sets app context', async () => {
    await setSentryContext({ orchard_id: 'o1' });
    expect(Sentry.setContext).toHaveBeenCalledWith('app_context', { orchard_id: 'o1' });
  });
});

describe('captureSentryError', () => {
  it('captures error without context', async () => {
    const err = new Error('test');
    await captureSentryError(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('sets context and captures error', async () => {
    const err = new Error('with context');
    await captureSentryError(err, { page: 'dashboard' });
    expect(Sentry.setContext).toHaveBeenCalledWith('error_context', { page: 'dashboard' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});

describe('addSentryBreadcrumb', () => {
  it('adds breadcrumb with message and data', async () => {
    await addSentryBreadcrumb('clicked button', { id: 'btn1' });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'clicked button',
        data: { id: 'btn1' },
        level: 'info',
      })
    );
  });
});
