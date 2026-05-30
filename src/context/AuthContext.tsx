/**
 * AuthContext — Global authentication state provider.
 *
 * SECURITY NOTE (S-1): This file imports `supabase` directly for auth-only
 * operations (signIn, signUp, signOut, session management). This is the sole
 * accepted exception to the repository pattern. All data access routes
 * through repositories; see context/index.tsx for the enforced boundary.
 */
/**
 * AuthContext - Global Authentication State Management
 *
 * **Architecture**: React Context API
 * **Why Context?**: Authentication changes infrequently, needed globally, non-performance-critical
 * **See**: `docs/architecture/state-management.md` for decision rationale
 *
 * @module context/AuthContext
 * @see {@link file:///c:/Users/ibrab/Downloads/app/harvestpro-nz%20%281%29/docs/architecture/state-management.md}
 */
import { logger } from '@/utils/logger';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { supabase } from '../services/supabase';
import { db } from '../services/db';
import { syncService } from '../services/sync.service';
import { Role } from '../types';
import ReAuthModal from '../components/modals/ReAuthModal';
import PrivacyConsentModal from '../components/modals/PrivacyConsentModal';
import { notificationService } from '../services/notification.service'; // 🔧 R9-Fix7
import { clearSentryUser } from '../config/sentry'; // 🔧 Sentry user tracking
import { analytics } from '../config/analytics'; // 📊 PostHog event tracking
import { authContextRepository } from '@/repositories/auth-context.repository';
import { loadUserProfile } from '@/hooks/useAuthSession';
import { clearDeviceTrust } from '../services/deviceTrust.service';
import { edgeFunctionWarmupService } from '../services/edgeFunctionWarmup.service';
import { clearBrowserStateOnLogout } from '@/utils/clearBrowserState';

// Types extracted to auth.types.ts for reuse
import type { AuthState, AuthContextType } from './auth.types';

// =============================================
// CONTEXT
// =============================================
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =============================================
// PROVIDER
// =============================================
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    appUser: null,
    isAuthenticated: false,
    isLoading: true,
    isSetupComplete: false,
    currentRole: null,
    userName: '',
    userEmail: '',
    orchardId: null,
    orchardName: '',
    availableOrchards: [],
    teamId: null,
    needsReAuth: false,
    needsPrivacyConsent: false,
  });

  const updateAuthState = useCallback((updates: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 🔧 BUG-1 fix: useRef to avoid stale closure in onAuthStateChange listener
  const isAuthenticatedRef = useRef(false);
  useEffect(() => {
    isAuthenticatedRef.current = state.isAuthenticated;
  }, [state.isAuthenticated]);

  // Guard: evita re-entrada si signOut ya está en curso (evita doble llamada desde onAuthStateChange)
  const isSigningOutRef = useRef(false);

  // Guard: evita llamadas paralelas a loadUserData (signIn + onAuthStateChange SIGNED_IN simultáneos)
  // Sin este guard, el pool de 15 conexiones se agota en los primeros 300ms del login
  const loadUserDataInFlightRef = useRef(false);

  // =============================================
  // LOAD USER DATA (delegated to useAuthSession)
  // =============================================
  const loadUserData = async (userId: string) => {
    if (loadUserDataInFlightRef.current) {
      logger.warn('[AuthContext] [CONN-TRACE] loadUserData ya está en vuelo — descartando llamada duplicada (protección pool)');
      return { userData: null, orchardId: null };
    }
    loadUserDataInFlightRef.current = true;
    try {
      logger.info('[CONN-TRACE] loadUserData start — getUserProfile (con retry)');
      const { stateUpdate, result } = await loadUserProfile(userId);
      // Carga todos los huertos disponibles para multi-orchard switching
      logger.info('[CONN-TRACE] loadUserData step 2 — getAllOrchards');
      const allOrchards = await authContextRepository.getAllOrchards();
      const currentOrchard = allOrchards.find(o => o.id === stateUpdate.orchardId);
      updateAuthState({
        ...stateUpdate,
        availableOrchards: allOrchards,
        orchardName: currentOrchard?.name || '',
      });
      // Iniciar warmup de Edge Functions críticas en cuanto el usuario está autenticado
      edgeFunctionWarmupService.start();
      return result;
    } catch (error) {
      logger.error('[AuthContext] Critical Error loading user data:', error);
      updateAuthState({
        user: null,
        appUser: null,
        isLoading: false,
        isAuthenticated: false,
        currentRole: null,
      });
      return { userData: null, orchardId: null };
    } finally {
      loadUserDataInFlightRef.current = false;
    }
  };

  // =============================================
  // AUTH ACTIONS
  // =============================================
  const signIn = async (email: string, password: string) => {
    updateAuthState({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        const { userData } = await loadUserData(data.user.id);
        // 🔧 BUG-2 fix: store the full session User object
        updateAuthState({ user: data.user, isAuthenticated: true });
        // 📊 PostHog: Track login event
        analytics.trackLogin(userData?.role || 'unknown', userData?.orchard_id);
        // 🔐 Privacy consent check: NZ Privacy Act 2020
        if (userData && !userData.privacy_consent_at) {
          updateAuthState({ needsPrivacyConsent: true });
        }
        return { user: data.user, profile: userData };
      } else {
        updateAuthState({ isLoading: false });
        return { user: null, profile: null };
      }
    } catch (error) {
      updateAuthState({ isLoading: false });
      throw error;
    }
  };

  /**
   * Register new user — validates email against HR whitelist first.
   * Role is auto-assigned from allowed_registrations table.
   * Email confirmation is handled by Supabase (built-in).
   */
  const signUp = async (email: string, password: string, fullName: string) => {
    updateAuthState({ isLoading: true });
    try {
      // 1. Check whitelist — is this email pre-authorized by HR?
      const { data: registration, error: regError } =
        await authContextRepository.checkWhitelist(email);

      if (regError) {
        logger.error('[Auth] Whitelist lookup failed:', regError);
        throw new Error('Error al verificar autorización. Inténtalo de nuevo.');
      }

      if (!registration) {
        throw new Error('Tu email no está autorizado. Contacta con RRHH para que te den acceso.');
      }

      if (registration.used_at) {
        throw new Error(
          'Este email ya ha sido registrado. Usa "Iniciar Sesión" o "¿Olvidaste tu contraseña?"'
        );
      }

      const authorizedRole = registration.role as Role;
      const authorizedOrchard = registration.orchard_id;

      // 2. Create Supabase auth user (email confirmation sent automatically)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: authorizedRole,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // 3. Insert into public.users with the HR-assigned role
        await authContextRepository.insertUser({
          id: data.user.id,
          email: email.toLowerCase().trim(),
          full_name: fullName,
          role: authorizedRole,
          orchard_id: authorizedOrchard,
          is_active: true,
        });

        // 4. Mark the whitelist entry as used
        await authContextRepository.markRegistrationUsed(registration.id);

        logger.info(`[Auth] User registered via whitelist: ${email} as ${authorizedRole}`);
      }
    } catch (error) {
      updateAuthState({ isLoading: false });
      throw error;
    }
  };

  /** Send password reset email via Supabase */
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    try {
      // 🔧 V27: Hard-gate — block logout if there are unsynced items
      const pendingCount = await syncService.getPendingCount();
      if (pendingCount > 0) {
        const confirmed = window.confirm(
          `⚠️ ALERTA CRÍTICA: Tienes ${pendingCount} registros sin sincronizar.\n\n` +
            `Si cierras sesión ahora, estos datos se perderán permanentemente ` +
            `(incluyendo información de nómina).\n\n` +
            `Conecta a internet y espera a que todo se sincronice antes de cerrar sesión.\n\n` +
            `¿Estás SEGURO de que quieres cerrar sesión y PERDER estos datos?`
        );
        if (!confirmed) return; // Abort sign-out
        logger.warn(
          `[Auth] User forced sign-out with ${pendingCount} pending items — DATA WILL BE LOST`
        );
      }

      // 🔧 R9-Fix7: Stop notification timer to prevent post-logout 401 errors & timer duplication
      notificationService.stopChecking();
      // 🔧 Sentry: Clear user context on logout
      clearSentryUser();
      // 📊 PostHog: Track logout event + clear identity
      analytics.trackLogout();
      // Detener warmup de Edge Functions — no consumir llamadas post-logout
      edgeFunctionWarmupService.stop();
      // Limpiar token de confianza MFA del dispositivo (web + Android)
      if (state.user?.id) {
        await clearDeviceTrust(state.user.id);
      }
      // 🔧 U6: Kill realtime channels BEFORE clearing auth
      supabase.removeAllChannels();
      await supabase.auth.signOut();
    } catch (error) {
      logger.error('Error signing out from Supabase:', error);
    } finally {
      // 🔧 U6: Wipe Dexie to prevent cross-session data leak on shared tablet
      try {
        await db.delete();
      } catch (e) {
        logger.error('[Auth] Dexie wipe failed:', e);
      }
      localStorage.clear();
      // Cross-user PII leak fix: previously Dexie + localStorage were cleared
      // but the SW Cache Storage (Workbox precache + runtime API caches),
      // react-query in-memory cache, and sessionStorage were left intact.
      // On a shared/BYOD device the next user saw the previous session's
      // dashboards until the caches expired. Privacy Act 2020 IPP 11.
      await clearBrowserStateOnLogout();
      isSigningOutRef.current = false;
      // 🔧 V26: Force hard reload to re-instantiate Dexie engine
      // Without this, the JS db instance is a zombie pointing to deleted IndexedDB
      window.location.reload();
    }
  };

  const logout = signOut;

  /** Switch to a different orchard — updates state and persists preference */
  const switchOrchard = useCallback(
    async (orchardId: string) => {
      const orchard = state.availableOrchards.find(o => o.id === orchardId);
      if (!orchard) {
        logger.warn(`[Auth] Cannot switch to unknown orchard: ${orchardId}`);
        return;
      }
      logger.info(`[Auth] Switching to orchard: ${orchard.name} (${orchardId})`);
      // Persist the preference in the users table
      if (state.user?.id) {
        await authContextRepository.assignOrchard(state.user.id, orchardId);
      }
      // Update local state
      updateAuthState({
        orchardId,
        orchardName: orchard.name,
      });
      // Clear lastSyncAt to force full refetch for the new orchard
      localStorage.removeItem('harvest-pro-storage');
      // Trigger page reload to reinitialize store with new orchard
      window.location.reload();
    },
    [state.availableOrchards, state.user?.id, updateAuthState]
  );

  // =============================================
  // EFFECTS
  // =============================================
  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    // 2. Auth state change listener (handles SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 🔄 TOKEN_REFRESHED: Token was silently renewed — no UI action needed
      if (event === 'TOKEN_REFRESHED') {
        logger.info('[Auth] Token refreshed silently in background');
        return; // Don't trigger loadUserData or signOut
      }

      // 🔧 BUG-1 fix: use ref instead of stale state closure
      if (session?.user && !isAuthenticatedRef.current) {
        loadUserData(session.user.id);
        // 🔧 BUG-2 fix: store the full User from session
        updateAuthState({ user: session.user });
      } else if (!session && isAuthenticatedRef.current) {
        // 🔧 R8-Fix2: Don't call signOut() if pending data exists —
        // that triggers V27 guard + Dexie wipe deadlock.
        const pendingCount = await syncService.getPendingCount();
        if (pendingCount > 0) {
          // 🔧 R9-Fix11: Try refreshSession() first
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData?.session) {
            logger.info(`[Auth] Session refreshed silently — ${pendingCount} pending items safe`);
            loadUserData(refreshData.session.user.id);
          } else {
            logger.warn(
              `[Auth] Session expired, refresh failed, ${pendingCount} pending items — showing re-auth modal`
            );
            setState(prev => ({ ...prev, needsReAuth: true }));
          }
        } else {
          signOut();
        }
      }
    });

    // 3. ⏱️ Proactive refresh timer — every 50 min (token expires at 60)
    //    Fails silently if offline (no harm — cached token works for local ops)
    const refreshTimer = setInterval(
      async () => {
        if (navigator.onLine) {
          logger.info('[Auth] Proactive token refresh (50-min timer)...');
          await supabase.auth.refreshSession().catch(() => {
            logger.warn('[Auth] Proactive refresh failed — will retry next interval');
          });
        }
      },
      50 * 60 * 1000
    );

    // 4. 📱 Visibility-based refresh with 3-min throttle
    //    Prevents DDoS (HTTP 429) when user tab-switches rapidly
    let lastVisibilityRefresh = 0;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const now = Date.now();
        if (now - lastVisibilityRefresh > 180_000) {
          // 3-min cooldown
          lastVisibilityRefresh = now;
          logger.info('[Auth] App in foreground — ensuring token health...');
          await supabase.auth.refreshSession().catch(() => {
            logger.warn('[Auth] Visibility refresh failed');
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: auth subscription must not re-subscribe on state changes

  // =============================================
  // CONTEXT VALUE
  // =============================================
  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signUp,
    resetPassword,
    signOut,
    logout,
    switchOrchard,
    updateAuthState,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {/* 🔧 R8-Fix2: Ineludible re-auth modal when JWT expires with pending data */}
      {state.needsReAuth && state.userEmail && (
        <ReAuthModal
          email={state.userEmail}
          onReAuthenticated={() => {
            setState(prev => ({ ...prev, needsReAuth: false }));
            // Resume sync after re-authentication
            syncService.processQueue();
          }}
        />
      )}
      {/* 🔐 NZ Privacy Act 2020: Ineludible consent modal on first login */}
      {state.needsPrivacyConsent && state.user && state.appUser && (
        <PrivacyConsentModal
          userId={state.user.id}
          userRole={state.appUser.role || 'runner'}
          onConsentGiven={() => {
            setState(prev => ({ ...prev, needsPrivacyConsent: false }));
          }}
        />
      )}
    </AuthContext.Provider>
  );
};

// =============================================
// HOOK
// =============================================
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Note: supabase is intentionally NOT re-exported here.
// All data access must go through repositories. Auth-only usage (signIn/signUp/signOut)
// is the sole exception and is confined to this file.
export default AuthContext;

