/**
 * Tests de authActions: lo que queda en el dispositivo al cerrar sesión.
 * En una tablet compartida no puede quedar nada de la sesión anterior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  dbDelete: vi.fn(),
  signOut: vi.fn(),
  removeAllChannels: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: { signOut: h.signOut },
    removeAllChannels: h.removeAllChannels,
  },
}));
vi.mock('@/services/db', () => ({ db: { delete: h.dbDelete } }));
vi.mock('@/services/sync.service', () => ({ syncService: { getPendingCount: vi.fn() } }));
vi.mock('@/services/notification.service', () => ({
  notificationService: { stopChecking: vi.fn() },
}));
vi.mock('@/config/sentry', () => ({ clearSentryUser: vi.fn() }));
vi.mock('@/config/analytics', () => ({ analytics: { trackLogout: vi.fn() } }));
vi.mock('@/repositories/auth-context.repository', () => ({ authContextRepository: {} }));
vi.mock('@/services/deviceTrust.service', () => ({ clearDeviceTrust: vi.fn() }));
vi.mock('@/services/edgeFunctionWarmup.service', () => ({
  edgeFunctionWarmupService: { stop: vi.fn() },
}));
vi.mock('@/services/push.service', () => ({
  pushService: { forgetDevice: vi.fn().mockResolvedValue(undefined) },
}));

import { wipeLocalData, teardownSession } from './authActions';

/** Cache Storage falsa con las cachés que crea el service worker (vite.config.ts). */
function fakeCaches(names: string[]) {
  const store = new Set(names);
  return {
    store,
    api: {
      keys: vi.fn(async () => [...store]),
      delete: vi.fn(async (name: string) => store.delete(name)),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.dbDelete.mockResolvedValue(undefined);
  h.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('wipeLocalData', () => {
  it('borra Dexie, toda la Cache Storage, localStorage y sessionStorage', async () => {
    const c = fakeCaches(['supabase-api-cache', 'images', 'deferred-vendor-chunks']);
    vi.stubGlobal('caches', c.api);
    localStorage.setItem('sb-harvestpro-auth-tab_1', '{"refresh_token":"r"}');
    sessionStorage.setItem('harvestpro_tab_id', 'tab_1');

    await wipeLocalData();

    expect(h.dbDelete).toHaveBeenCalledTimes(1);
    expect(c.api.delete).toHaveBeenCalledWith('supabase-api-cache');
    expect(c.store.size).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('si Dexie o la Cache Storage fallan, el resto se borra igual', async () => {
    h.dbDelete.mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('SecurityError')),
      delete: vi.fn(),
    });
    localStorage.setItem('k', 'v');
    sessionStorage.setItem('k', 'v');

    await expect(wipeLocalData()).resolves.toBeUndefined();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('sin Cache Storage (contexto no seguro) no falla', async () => {
    vi.stubGlobal('caches', undefined);
    sessionStorage.setItem('k', 'v');
    await expect(wipeLocalData()).resolves.toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });
});

describe('teardownSession', () => {
  it('cierra solo la sesión de este dispositivo (scope local) tras cerrar los canales', async () => {
    await teardownSession(undefined);
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.removeAllChannels.mock.invocationCallOrder[0]).toBeLessThan(
      h.signOut.mock.invocationCallOrder[0]
    );
  });
});
