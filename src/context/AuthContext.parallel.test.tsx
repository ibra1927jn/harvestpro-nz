/**
 * Arranque: el perfil del usuario y la lista de huertos se piden en paralelo.
 * Antes iban en serie (users → orchards): en 3G (~2 s de RTT) cada arranque,
 * frío o desde el service worker, esperaba un viaje de ida y vuelta de más
 * antes de pintar la pantalla del rol.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getUserProfile: vi.fn(),
  getAllOrchards: vi.fn(),
  getFirstOrchardId: vi.fn(),
  assignOrchard: vi.fn(),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: vi.fn(),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(),
    removeAllChannels: vi.fn(),
  },
}));
vi.mock('@/services/db', () => ({ db: { delete: vi.fn() } }));
vi.mock('@/services/sync.service', () => ({
  syncService: { getPendingCount: vi.fn().mockResolvedValue(0), processQueue: vi.fn() },
}));
vi.mock('@/services/notification.service', () => ({ notificationService: { stopChecking: vi.fn() } }));
vi.mock('@/services/edgeFunctionWarmup.service', () => ({
  edgeFunctionWarmupService: { start: vi.fn(), stop: vi.fn() },
}));
vi.mock('@/config/sentry', () => ({ setSentryUser: vi.fn(), clearSentryUser: vi.fn() }));
vi.mock('@/config/analytics', () => ({
  analytics: { trackLogin: vi.fn(), trackLogout: vi.fn(), identify: vi.fn() },
}));
vi.mock('@/repositories/auth-context.repository', () => ({
  authContextRepository: {
    getUserProfile: mocks.getUserProfile,
    getAllOrchards: mocks.getAllOrchards,
    getFirstOrchardId: mocks.getFirstOrchardId,
    assignOrchard: mocks.assignOrchard,
    getUserById: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/components/modals/ReAuthModal', () => ({ default: () => null }));
vi.mock('@/components/modals/PrivacyConsentModal', () => ({ default: () => null }));

import { AuthProvider, useAuth } from './AuthContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const runner = {
  id: 'u1',
  email: 'runner@test.nz',
  full_name: 'R',
  role: 'runner',
  orchard_id: 'o2',
  privacy_consent_at: '2026-01-01',
};
const orchards = [
  { id: 'o1', name: 'Alpha', total_rows: 10 },
  { id: 'o2', name: 'Beta', total_rows: 20 },
];

describe('AuthContext — carga del usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('pide los huertos sin esperar a que llegue el perfil', async () => {
    let resolveProfile: (v: { data: typeof runner; error: null }) => void = () => undefined;
    mocks.getUserProfile.mockReturnValue(new Promise(r => (resolveProfile = r)));
    mocks.getAllOrchards.mockResolvedValue(orchards);

    let hook: { result: { current: ReturnType<typeof useAuth> } } | undefined;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper });
    });
    let signIn: Promise<unknown> = Promise.resolve();
    await act(async () => {
      signIn = hook!.result.current.signIn('runner@test.nz', 'x');
      await Promise.resolve();
    });

    // El perfil sigue pendiente y los huertos ya se han pedido
    await waitFor(() => expect(mocks.getAllOrchards).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveProfile({ data: runner, error: null });
      await signIn;
    });
    expect(hook!.result.current.orchardName).toBe('Beta');
    expect(hook!.result.current.availableOrchards).toEqual(orchards);
    expect(mocks.getAllOrchards).toHaveBeenCalledTimes(1);
  });

  it('si el huerto se autoasigna en este login (rol de oficina), vuelve a pedir la lista', async () => {
    mocks.getUserProfile.mockResolvedValue({ data: { ...runner, role: 'manager', orchard_id: null }, error: null });
    mocks.getFirstOrchardId.mockResolvedValue('o1');
    mocks.assignOrchard.mockResolvedValue(undefined);
    // Antes de asignar, RLS no deja ver ninguno; después, sí
    mocks.getAllOrchards.mockResolvedValueOnce([]).mockResolvedValueOnce(orchards);

    let hook: { result: { current: ReturnType<typeof useAuth> } } | undefined;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper });
    });
    await act(async () => {
      await hook!.result.current.signIn('runner@test.nz', 'x');
    });
    expect(mocks.getAllOrchards).toHaveBeenCalledTimes(2);
    expect(hook!.result.current.orchardName).toBe('Alpha');
  });
});
