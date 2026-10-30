/**
 * Tests de config/sentry.ts — Sentry diferido con cola.
 *
 * - Sin DSN el SDK no se descarga nunca (ni siquiera al llamar setSentryUser, que
 *   antes lo importaba en el login y bajaba ~145 KB en 3G para nada).
 * - Con DSN, lo que ocurre antes de initSentry (errores de arranque incluidos) se
 *   encola y se reenvía al inicializar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdk = vi.hoisted(() => ({
  loaded: 0,
  init: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@sentry/react', () => {
  sdk.loaded++;
  return {
    init: sdk.init,
    setUser: sdk.setUser,
    setContext: sdk.setContext,
    captureException: sdk.captureException,
    addBreadcrumb: sdk.addBreadcrumb,
    browserTracingIntegration: vi.fn(() => ({})),
    replayIntegration: vi.fn(() => ({})),
  };
});

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type SentryModule = typeof import('./sentry');

async function freshModule(): Promise<SentryModule> {
  vi.resetModules();
  return import('./sentry');
}

beforeEach(() => {
  sdk.loaded = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sin DSN', () => {
  beforeEach(() => vi.stubEnv('VITE_SENTRY_DSN', ''));

  it('no descarga el SDK aunque se usen las funciones', async () => {
    const m = await freshModule();
    await m.setSentryUser({ id: 'u1', role: 'runner' });
    await m.clearSentryUser();
    await m.captureSentryError(new Error('boom'));
    await m.addSentryBreadcrumb('x');
    await m.initSentry();
    expect(sdk.loaded).toBe(0);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(m.pendingSentryCalls()).toBe(0);
  });
});

describe('con DSN', () => {
  beforeEach(() => vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1'));

  it('no carga el SDK hasta initSentry y reenvía lo encolado en orden', async () => {
    const m = await freshModule();
    const err = new Error('startup crash');
    await m.setSentryUser({ id: 'u1', role: 'manager' });
    await m.captureSentryError(err, { page: 'login' });
    await m.addSentryBreadcrumb('clicked', { id: 'b1' });
    expect(sdk.loaded).toBe(0);
    expect(m.pendingSentryCalls()).toBe(3);

    await m.initSentry();

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1', role: 'manager' });
    expect(sdk.setContext).toHaveBeenCalledWith('error_context', { page: 'login' });
    expect(sdk.captureException).toHaveBeenCalledWith(err);
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'clicked', data: { id: 'b1' }, level: 'info' })
    );
    // init antes que los reenvíos
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.captureException.mock.invocationCallOrder[0]
    );
    expect(m.pendingSentryCalls()).toBe(0);
  });

  it('tras init las llamadas van directas al SDK', async () => {
    const m = await freshModule();
    await m.initSentry();
    await m.setSentryContext({ orchard_id: 'o1' });
    await m.clearSentryUser();
    expect(sdk.setContext).toHaveBeenCalledWith('app_context', { orchard_id: 'o1' });
    expect(sdk.setUser).toHaveBeenCalledWith(null);
  });

  it('la cola está acotada', async () => {
    const m = await freshModule();
    for (let i = 0; i < m.MAX_PENDING_SENTRY_CALLS + 20; i++) {
      await m.captureSentryError(new Error(`e${i}`));
    }
    expect(m.pendingSentryCalls()).toBe(m.MAX_PENDING_SENTRY_CALLS);
  });

  it('initSentry es idempotente', async () => {
    const m = await freshModule();
    await Promise.all([m.initSentry(), m.initSentry()]);
    await m.initSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it('captura errores globales del arranque antes de que cargue el SDK', async () => {
    const m = await freshModule();
    m.installEarlyErrorCapture();
    const err = new Error('render crash');
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: err.message }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: 'chunk failed' });
    window.dispatchEvent(rejection);
    expect(m.pendingSentryCalls()).toBe(2);

    await m.initSentry();
    expect(sdk.captureException).toHaveBeenCalledWith(err);
    expect(sdk.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'chunk failed' })
    );

    // Tras init los handlers tempranos se quitan (el SDK pone los suyos): sin duplicados
    sdk.captureException.mockClear();
    window.dispatchEvent(new ErrorEvent('error', { message: 'later' }));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});

describe('datos personales (NZ Privacy Act)', () => {
  beforeEach(() => vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1'));

  type InitOptions = {
    beforeSend: (e: Record<string, unknown>) => Record<string, unknown> | null;
    beforeBreadcrumb: (b: Record<string, unknown>) => Record<string, unknown>;
  };

  async function initOptions(): Promise<InitOptions> {
    const m = await freshModule();
    await m.initSentry();
    return sdk.init.mock.calls[0][0] as InitOptions;
  }

  it('setSentryUser no manda el email aunque se lo pasen', async () => {
    const m = await freshModule();
    await m.initSentry();
    const conEmail = { id: 'u1', role: 'manager', email: 'a@test.com' };
    await m.setSentryUser(conEmail);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1', role: 'manager' });
  });

  it('beforeSend limpia email, IRD y cuenta bancaria de todo el evento', async () => {
    const { beforeSend } = await initOptions();
    const out = beforeSend({
      message: 'fallo para ana@example.co.nz',
      exception: {
        values: [
          { value: 'IRD 123-456-789 inválido' },
          { value: 'cuenta 12-3456-7890123-00 rechazada' },
        ],
      },
      breadcrumbs: [
        { message: 'GET /rest/v1/users?email=eq.bob@farm.nz', data: { picker_id: 'p-9' } },
      ],
      extra: { ird_number: '98765432', nota: 'llamar a ana@example.co.nz' },
      contexts: { error_context: { bank_account: '01-0001-0000001-000' } },
      request: { url: 'https://x/?ird=123456789', data: { email: 'c@d.nz' }, cookies: 'sb=1' },
      user: { id: 'u1', email: 'a@test.com', ip_address: '1.2.3.4' },
    });
    const json = JSON.stringify(out);
    for (const secreto of [
      'ana@example.co.nz',
      'bob@farm.nz',
      'c@d.nz',
      'a@test.com',
      '123-456-789',
      '123456789',
      '98765432',
      '12-3456-7890123-00',
      '01-0001-0000001-000',
      'p-9',
      '1.2.3.4',
      'sb=1',
    ]) {
      expect(json).not.toContain(secreto);
    }
    expect(out?.user).toEqual({ id: 'u1' });
  });

  it('beforeBreadcrumb limpia mensaje y datos', async () => {
    const { beforeBreadcrumb } = await initOptions();
    const out = beforeBreadcrumb({
      message: 'login de ana@example.co.nz',
      data: { url: '/x?email=ana@example.co.nz', full_name: 'Ana Pérez' },
    });
    expect(JSON.stringify(out)).not.toMatch(/ana@example|Ana Pérez/);
  });
});
