/**
 * Tests for AuthContext — provider, hook, and auth actions
 *
 * Tests: signIn, signUp, signOut, resetPassword,
 *        useAuth hook, initial state, loading states
 * @module context/AuthContext.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';

// ── Hoisted mocks ─────────────────────────────────────
const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  onAuthStateChange: vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  }),
  checkWhitelist: vi.fn(),
  insertUser: vi.fn(),
  markRegistrationUsed: vi.fn(),
  getUserById: vi.fn().mockResolvedValue({ data: null, error: null }),
  getPendingCount: vi.fn().mockResolvedValue(0),
  processQueue: vi.fn(),
  stopChecking: vi.fn(),
  trackLogin: vi.fn(),
  trackLogout: vi.fn(),
  identify: vi.fn(),
  removeAllChannels: vi.fn(),
  dbDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      refreshSession: mocks.refreshSession,
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    removeAllChannels: mocks.removeAllChannels,
  },
}));
vi.mock('@/services/db', () => ({
  db: { delete: mocks.dbDelete },
}));
vi.mock('@/services/sync.service', () => ({
  syncService: { getPendingCount: mocks.getPendingCount, processQueue: mocks.processQueue },
}));
vi.mock('@/services/notification.service', () => ({
  notificationService: { stopChecking: mocks.stopChecking },
}));
vi.mock('@/config/sentry', () => ({
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));
vi.mock('@/config/analytics', () => ({
  analytics: {
    trackLogin: mocks.trackLogin,
    trackLogout: mocks.trackLogout,
    identify: mocks.identify,
  },
}));
vi.mock('@/repositories/auth-context.repository', () => ({
  authContextRepository: {
    checkWhitelist: mocks.checkWhitelist,
    insertUser: mocks.insertUser,
    markRegistrationUsed: mocks.markRegistrationUsed,
    getUserById: mocks.getUserById,
  },
}));
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/components/modals/ReAuthModal', () => ({
  default: () => null,
}));

import { AuthProvider, useAuth } from './AuthContext';

// ── Helpers ──────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// Allow async effects to settle after render
const renderAuthHook = async () => {
  let result: any;
  await act(async () => {
    result = renderHook(() => useAuth(), { wrapper });
  });
  return result!;
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset defaults
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.getPendingCount.mockResolvedValue(0);
    mocks.getUserById.mockResolvedValue({ data: null, error: null });
  });

  // ── Provider & Hook ──────────────────────────────
  describe('Provider & Hook', () => {
    it('renders children correctly', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <p>Hello Auth</p>
          </AuthProvider>
        );
      });
      expect(screen.getByText('Hello Auth')).toBeTruthy();
    });

    it('useAuth returns complete API shape', async () => {
      const { result } = await renderAuthHook();
      const ctx = result.current;

      // State properties
      expect(ctx).toHaveProperty('user');
      expect(ctx).toHaveProperty('appUser');
      expect(ctx).toHaveProperty('isAuthenticated');
      expect(ctx).toHaveProperty('isLoading');
      expect(ctx).toHaveProperty('isSetupComplete');
      expect(ctx).toHaveProperty('currentRole');
      expect(ctx).toHaveProperty('userName');
      expect(ctx).toHaveProperty('userEmail');
      expect(ctx).toHaveProperty('orchardId');
      expect(ctx).toHaveProperty('teamId');
      expect(ctx).toHaveProperty('needsReAuth');

      // Actions
      expect(typeof ctx.signIn).toBe('function');
      expect(typeof ctx.signUp).toBe('function');
      expect(typeof ctx.signOut).toBe('function');
      expect(typeof ctx.logout).toBe('function');
      expect(typeof ctx.resetPassword).toBe('function');
      expect(typeof ctx.updateAuthState).toBe('function');
    });

    it('useAuth throws outside AuthProvider', () => {
      expect(() => renderHook(() => useAuth())).toThrow();
    });
  });

  // ── Initial State ────────────────────────────────
  describe('Initial State', () => {
    it('user is initially null', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.user).toBeNull();
    });

    it('appUser is initially null', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.appUser).toBeNull();
    });

    it('isAuthenticated is initially false', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('currentRole is initially null', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.currentRole).toBeNull();
    });

    it('orchardId is initially null', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.orchardId).toBeNull();
    });

    it('needsReAuth is initially false', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.needsReAuth).toBe(false);
    });

    it('userName is initially empty', async () => {
      const { result } = await renderAuthHook();
      expect(result.current.userName).toBe('');
    });

    it('isLoading becomes false after session check', async () => {
      const { result } = await renderAuthHook();
      // After session check resolves with no session, isLoading should be false
      expect(result.current.isLoading).toBe(false);
    });
  });

  // ── signIn ───────────────────────────────────────
  describe('signIn', () => {
    it('calls signInWithPassword on Supabase', async () => {
      mocks.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 't@h.nz' }, session: {} },
        error: null,
      });
      mocks.getUserById.mockResolvedValue({
        data: { id: 'u1', name: 'Test', role: 'manager', orchard_id: 'o1', is_active: true },
        error: null,
      });

      const { result } = await renderAuthHook();

      await act(async () => {
        await result.current.signIn('t@h.nz', 'pass123');
      });

      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: 't@h.nz',
        password: 'pass123',
      });
    });

    it('throws on invalid credentials', async () => {
      mocks.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const { result } = await renderAuthHook();

      await expect(
        act(async () => {
          await result.current.signIn('bad@email.com', 'wrong');
        })
      ).rejects.toThrow();
    });

    it('returns null profile when no user returned', async () => {
      mocks.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      });

      const { result } = await renderAuthHook();

      let response;
      await act(async () => {
        response = await result.current.signIn('no@user.com', 'pass');
      });

      expect(response).toEqual({ user: null, profile: null });
    });
  });

  // ── signUp ───────────────────────────────────────
  describe('signUp', () => {
    it('throws when email not in whitelist', async () => {
      mocks.checkWhitelist.mockResolvedValue({ data: null, error: null });

      const { result } = await renderAuthHook();

      await expect(
        act(async () => {
          await result.current.signUp('notlisted@email.com', 'pass123', 'John');
        })
      ).rejects.toThrow('email no está autorizado');
    });

    it('throws when whitelist entry already used', async () => {
      mocks.checkWhitelist.mockResolvedValue({
        data: { id: 'reg-1', role: 'picker', orchard_id: 'o1', used_at: '2026-01-01' },
        error: null,
      });

      const { result } = await renderAuthHook();

      await expect(
        act(async () => {
          await result.current.signUp('used@email.com', 'pass123', 'Jane');
        })
      ).rejects.toThrow('ya ha sido registrado');
    });

    it('registers user when whitelist is valid', async () => {
      mocks.checkWhitelist.mockResolvedValue({
        data: { id: 'reg-1', role: 'picker', orchard_id: 'orch-1', used_at: null },
        error: null,
      });
      mocks.signUp.mockResolvedValue({
        data: { user: { id: 'new-user-1' }, session: null },
        error: null,
      });
      mocks.insertUser.mockResolvedValue(undefined);
      mocks.markRegistrationUsed.mockResolvedValue(undefined);

      const { result } = await renderAuthHook();

      await act(async () => {
        await result.current.signUp('new@email.com', 'securepass', 'New User');
      });

      expect(mocks.signUp).toHaveBeenCalled();
      expect(mocks.insertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user-1',
          email: 'new@email.com',
          role: 'picker',
        })
      );
      expect(mocks.markRegistrationUsed).toHaveBeenCalledWith('reg-1');
    });

    it('throws when whitelist lookup fails', async () => {
      mocks.checkWhitelist.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

      const { result } = await renderAuthHook();

      await expect(
        act(async () => {
          await result.current.signUp('fail@email.com', 'pass', 'User');
        })
      ).rejects.toThrow('verificar autorización');
    });
  });

  // ── resetPassword ────────────────────────────────
  describe('resetPassword', () => {
    it('sends reset email via Supabase', async () => {
      mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

      const { result } = await renderAuthHook();

      await act(async () => {
        await result.current.resetPassword('user@harvest.nz');
      });

      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@harvest.nz',
        expect.objectContaining({ redirectTo: expect.stringContaining('/login') })
      );
    });

    it('throws on reset failure', async () => {
      mocks.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'User not found' },
      });

      const { result } = await renderAuthHook();

      await expect(
        act(async () => {
          await result.current.resetPassword('noone@email.com');
        })
      ).rejects.toThrow();
    });
  });

  // ── signOut ──────────────────────────────────────
  describe('signOut', () => {
    it('signs out without pending sync', async () => {
      mocks.getPendingCount.mockResolvedValue(0);
      mocks.signOut.mockResolvedValue({ error: null });
      // Mock window.location.reload
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadMock, origin: 'http://localhost' },
        writable: true,
        configurable: true,
      });

      const { result } = await renderAuthHook();

      await act(async () => {
        await result.current.signOut();
      });

      expect(mocks.stopChecking).toHaveBeenCalled();
      expect(mocks.signOut).toHaveBeenCalled();
    });

    it('warns user when pending sync items exist', async () => {
      mocks.getPendingCount.mockResolvedValue(5);
      const confirmMock = vi.fn().mockReturnValue(false);
      globalThis.confirm = confirmMock;

      const { result } = await renderAuthHook();

      await act(async () => {
        await result.current.signOut();
      });

      expect(confirmMock).toHaveBeenCalled();
      // Should NOT sign out since confirm returned false
      expect(mocks.signOut).not.toHaveBeenCalled();
      // Cancelar no puede borrar los datos pendientes (antes el finally borraba Dexie igualmente)
      expect(mocks.dbDelete).not.toHaveBeenCalled();
    });
  });

  // ── updateAuthState ──────────────────────────────
  describe('updateAuthState', () => {
    it('updates partial state', async () => {
      const { result } = await renderAuthHook();

      act(() => {
        result.current.updateAuthState({ needsReAuth: true });
      });

      expect(result.current.needsReAuth).toBe(true);
    });

    it('preserves existing state on partial update', async () => {
      const { result } = await renderAuthHook();

      act(() => {
        result.current.updateAuthState({ userName: 'TestUser' });
      });

      expect(result.current.userName).toBe('TestUser');
      // Other state should still be default
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  // ── Auth State Listener ──────────────────────────
  describe('Auth State Listener', () => {
    it('subscribes to auth state changes on mount', async () => {
      await renderAuthHook();
      expect(mocks.onAuthStateChange).toHaveBeenCalled();
    });

    it('checks session on mount', async () => {
      await renderAuthHook();
      expect(mocks.getSession).toHaveBeenCalled();
    });
  });
});

