/**
 * Tests for useAuthSession — resolveRole + loadUserProfile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/config/sentry', () => ({
  setSentryUser: vi.fn(),
}));

vi.mock('@/config/analytics', () => ({
  analytics: { identify: vi.fn() },
}));

const mockGetUserProfile = vi.fn();
const mockGetFirstOrchardId = vi.fn();
const mockAssignOrchard = vi.fn();

vi.mock('@/repositories/auth-context.repository', () => ({
  authContextRepository: {
    getUserProfile: (...a: unknown[]) => mockGetUserProfile(...a),
    getFirstOrchardId: (...a: unknown[]) => mockGetFirstOrchardId(...a),
    assignOrchard: (...a: unknown[]) => mockAssignOrchard(...a),
  },
}));

import { resolveRole, loadUserProfile, isTransientProfileError } from './useAuthSession';
import { setSentryUser } from '@/config/sentry';
import { analytics } from '@/config/analytics';

describe('resolveRole', () => {
  it('maps manager role', () => {
    expect(resolveRole('manager')).toBe('manager');
  });

  it('maps team_leader role', () => {
    expect(resolveRole('team_leader')).toBe('team_leader');
  });

  it('maps bucket_runner to runner', () => {
    expect(resolveRole('bucket_runner')).toBe('runner');
  });

  it('maps qc_inspector role', () => {
    expect(resolveRole('qc_inspector')).toBe('qc_inspector');
  });

  it('returns null for unknown role', () => {
    expect(resolveRole('unknown_role')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(resolveRole(null)).toBeNull();
    expect(resolveRole(undefined)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(resolveRole('MANAGER')).toBe('manager');
    expect(resolveRole('Team_Leader')).toBe('team_leader');
  });
});

describe('loadUserProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads user profile and returns state update', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: {
        id: 'u1',
        full_name: 'Alice',
        email: 'a@test.com',
        role: 'manager',
        orchard_id: 'o1',
      },
      error: null,
    });
    const result = await loadUserProfile('u1');
    expect(result.stateUpdate.isAuthenticated).toBe(true);
    expect(result.stateUpdate.userName).toBe('Alice');
    expect(result.result.orchardId).toBe('o1');
  });

  it('does not wipe the session user already stored by onAuthStateChange', async () => {
    // Bug: devolvía user: null y al aplicarlo machacaba el usuario de la sesión
    // (MFAGuard no veía user.id y la confianza del dispositivo nunca funcionaba)
    mockGetUserProfile.mockResolvedValue({
      data: { id: 'u1', full_name: 'Alice', email: 'a@test.com', role: 'manager', orchard_id: 'o1' },
      error: null,
    });
    const result = await loadUserProfile('u1');
    expect('user' in result.stateUpdate).toBe(false);
  });

  it('identifica en Sentry y PostHog solo con el id opaco, sin email (NZ Privacy Act)', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: { id: 'u1', full_name: 'Alice', email: 'a@test.com', role: 'manager', orchard_id: 'o1' },
      error: null,
    });
    await loadUserProfile('u1');
    expect(setSentryUser).toHaveBeenCalledWith({ id: 'u1', role: 'manager' });
    expect(analytics.identify).toHaveBeenCalledWith('u1', { role: 'manager', orchard_id: 'o1' });
    const sent = JSON.stringify([
      vi.mocked(setSentryUser).mock.calls,
      vi.mocked(analytics.identify).mock.calls,
    ]);
    expect(sent).not.toMatch(/a@test\.com|Alice/);
  });

  it('auto-assigns orchard when user has none', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: {
        id: 'u1',
        full_name: 'Alice',
        email: 'a@test.com',
        role: 'manager',
        orchard_id: null,
      },
      error: null,
    });
    mockGetFirstOrchardId.mockResolvedValue('auto-o1');
    mockAssignOrchard.mockResolvedValue(undefined);

    const result = await loadUserProfile('u1');
    expect(mockAssignOrchard).toHaveBeenCalledWith('u1', 'auto-o1');
    expect(result.result.orchardId).toBe('auto-o1');
  });

  it('does not auto-assign an orchard to field staff (manager / HR link them)', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: { id: 'u2', full_name: 'Tama', email: 't@test.com', role: 'team_leader', orchard_id: null },
      error: null,
    });
    mockGetFirstOrchardId.mockResolvedValue('auto-o1');

    const result = await loadUserProfile('u2');
    expect(mockAssignOrchard).not.toHaveBeenCalled();
    expect(result.result.orchardId).toBeNull();
  });

  it('throws on DB error', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });
    await expect(loadUserProfile('u1')).rejects.toThrow('User profile not found');
  });

  it('throws server error on 504', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: null,
      error: { message: '504 Gateway Timeout' },
    });
    await expect(loadUserProfile('u1')).rejects.toThrow('Servidor no disponible');
  });

  it('throws server error on PGRST003 (connection pool timeout)', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: null,
      error: { code: 'PGRST003', message: 'statement timeout' },
    });
    await expect(loadUserProfile('u1')).rejects.toThrow('Servidor no disponible');
  });

  it('throws server error on PGRST002 (pool acquisition timeout)', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: null,
      error: { code: 'PGRST002', message: 'could not acquire connection' },
    });
    await expect(loadUserProfile('u1')).rejects.toThrow('Servidor no disponible');
  });

  it('throws on unknown role', async () => {
    mockGetUserProfile.mockResolvedValue({
      data: { id: 'u1', full_name: 'Alice', email: 'a@test.com', role: 'alien', orchard_id: 'o1' },
      error: null,
    });
    await expect(loadUserProfile('u1')).rejects.toThrow('Access Denied');
  });
});

describe('isTransientProfileError', () => {
  it('timeouts de PostgREST (PGRST002/003) son transitorios', () => {
    expect(isTransientProfileError({ code: 'PGRST002', message: 'x' })).toBe(true);
    expect(isTransientProfileError({ code: 'PGRST003' })).toBe(true);
  });

  it('5xx, timeout y fallos de red son transitorios (sin distinguir mayúsculas)', () => {
    for (const message of ['504 Gateway', 'HTTP 502', '503', 'Request TIMEOUT', 'Failed to fetch', 'NetworkError']) {
      expect(isTransientProfileError({ message })).toBe(true);
    }
  });

  it('perfil inexistente o sin error no son transitorios', () => {
    expect(isTransientProfileError({ code: 'PGRST116', message: 'JSON object requested, 0 rows' })).toBe(false);
    expect(isTransientProfileError(null)).toBe(false);
    expect(isTransientProfileError({})).toBe(false);
  });
});
