/**
 * AuthContext — Global authentication state provider.
 *
 * SECURITY NOTE (S-1): this module and `context/auth/*` import `supabase`
 * directly for auth-only operations (signIn, signUp, signOut, session
 * management). This is the sole accepted exception to the repository pattern.
 *
 * Responsabilidades repartidas en context/auth/:
 * - authLogic.ts: lógica pura (estado inicial, lista blanca, decisiones de sesión)
 * - authActions.ts: registro, reset de contraseña, limpieza al cerrar sesión
 * - useAuthLifecycle.ts: sesión inicial + onAuthStateChange
 * - useSessionKeepAlive.ts: refresco proactivo del token
 * - AuthModals.tsx: re-autenticación y consentimiento de privacidad
 *
 * @module context/AuthContext
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
import { analytics } from '../config/analytics';
import { authContextRepository } from '@/repositories/auth-context.repository';
import { loadUserProfile } from '@/hooks/useAuthSession';
import { edgeFunctionWarmupService } from '../services/edgeFunctionWarmup.service';
import type { AuthState, AuthContextType } from './auth.types';
import {
  FAILED_PROFILE_LOAD_STATE,
  INITIAL_AUTH_STATE,
  needsPrivacyConsent,
  orchardNameFor,
} from './auth/authLogic';
import {
  confirmSignOutWithPendingData,
  registerWithWhitelist,
  sendPasswordReset,
  teardownSession,
  wipeLocalData,
} from './auth/authActions';
import { useAuthLifecycle } from './auth/useAuthLifecycle';
import { useSessionKeepAlive } from './auth/useSessionKeepAlive';
import { AuthModals } from './auth/AuthModals';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(INITIAL_AUTH_STATE);

  const updateAuthState = useCallback((updates: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // BUG-1: ref para que el listener de onAuthStateChange no lea un estado obsoleto
  const isAuthenticatedRef = useRef(false);
  useEffect(() => {
    isAuthenticatedRef.current = state.isAuthenticated;
  }, [state.isAuthenticated]);

  // El listener de onAuthStateChange llama al signOut del primer render (user = null):
  // signOut lee el usuario de este ref para limpiar su confianza MFA del dispositivo
  const userIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    userIdRef.current = state.user?.id ?? state.appUser?.id ?? undefined;
  }, [state.user?.id, state.appUser?.id]);

  // Evita re-entrada si signOut ya está en curso (doble llamada desde onAuthStateChange)
  const isSigningOutRef = useRef(false);

  // Evita llamadas paralelas a loadUserData (signIn + SIGNED_IN simultáneos):
  // sin este guard el pool de 15 conexiones se agota en los primeros 300 ms del login
  const loadUserDataInFlightRef = useRef(false);

  const loadUserData = async (userId: string) => {
    if (loadUserDataInFlightRef.current) {
      logger.warn('[AuthContext] [CONN-TRACE] loadUserData ya está en vuelo — descartando llamada duplicada (protección pool)');
      return { userData: null, orchardId: null };
    }
    loadUserDataInFlightRef.current = true;
    try {
      logger.info('[CONN-TRACE] loadUserData start — getUserProfile + getAllOrchards en paralelo');
      // Huertos en paralelo con el perfil: en serie costaban un viaje más (~2 s en 3G)
      const orchardsPromise = authContextRepository.getAllOrchards().catch(() => []);
      const { stateUpdate, result } = await loadUserProfile(userId);
      // Si el perfil no tenía huerto se acaba de autoasignar: la lista puede haber cambiado (RLS)
      const allOrchards = result.userData?.orchard_id
        ? await orchardsPromise
        : await authContextRepository.getAllOrchards();
      updateAuthState({
        ...stateUpdate,
        availableOrchards: allOrchards,
        orchardName: orchardNameFor(allOrchards, stateUpdate.orchardId),
      });
      // Warmup de Edge Functions críticas en cuanto hay usuario
      edgeFunctionWarmupService.start(stateUpdate.currentRole);
      return result;
    } catch (error) {
      logger.error('[AuthContext] Critical Error loading user data:', error);
      updateAuthState(FAILED_PROFILE_LOAD_STATE);
      return { userData: null, orchardId: null };
    } finally {
      loadUserDataInFlightRef.current = false;
    }
  };

  const signIn = async (email: string, password: string) => {
    updateAuthState({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) {
        updateAuthState({ isLoading: false });
        return { user: null, profile: null };
      }
      const { userData } = await loadUserData(data.user.id);
      // BUG-2: guardar el User completo de la sesión
      updateAuthState({ user: data.user, isAuthenticated: true });
      analytics.trackLogin(userData?.role || 'unknown', userData?.orchard_id);
      if (needsPrivacyConsent(userData)) {
        updateAuthState({ needsPrivacyConsent: true });
      }
      return { user: data.user, profile: userData };
    } catch (error) {
      updateAuthState({ isLoading: false });
      throw error;
    }
  };

  /** Registro: el email debe estar en la lista blanca de RRHH */
  const signUp = async (email: string, password: string, fullName: string) => {
    updateAuthState({ isLoading: true });
    try {
      await registerWithWhitelist(email, password, fullName);
    } catch (error) {
      updateAuthState({ isLoading: false });
      throw error;
    }
  };

  const signOut = async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    let aborted = false;
    try {
      // V27: bloquear si hay registros sin sincronizar y el usuario cancela
      if (!(await confirmSignOutWithPendingData())) {
        aborted = true;
        return;
      }
      await teardownSession(userIdRef.current);
    } catch (error) {
      logger.error('Error signing out from Supabase:', error);
    } finally {
      if (aborted) {
        isSigningOutRef.current = false;
      } else {
        await wipeLocalData();
        isSigningOutRef.current = false;
        // V26: recarga para recrear Dexie (la instancia JS apunta a una BD borrada)
        window.location.reload();
      }
    }
  };

  /** Cambia de huerto: persiste la preferencia y recarga el store */
  const switchOrchard = useCallback(
    async (orchardId: string) => {
      const orchard = state.availableOrchards.find(o => o.id === orchardId);
      if (!orchard) {
        logger.warn(`[Auth] Cannot switch to unknown orchard: ${orchardId}`);
        return;
      }
      logger.info(`[Auth] Switching to orchard: ${orchard.name} (${orchardId})`);
      if (state.user?.id) {
        await authContextRepository.assignOrchard(state.user.id, orchardId);
      }
      updateAuthState({ orchardId, orchardName: orchard.name });
      // Borrar lastSyncAt fuerza la recarga completa del huerto nuevo
      localStorage.removeItem('harvest-pro-storage');
      window.location.reload();
    },
    [state.availableOrchards, state.user?.id, updateAuthState]
  );

  useAuthLifecycle({ isAuthenticatedRef, loadUserData, signOut, updateAuthState });
  useSessionKeepAlive();

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signUp,
    resetPassword: sendPasswordReset,
    signOut,
    logout: signOut,
    switchOrchard,
    updateAuthState,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <AuthModals
        state={state}
        onReAuthenticated={() => updateAuthState({ needsReAuth: false })}
        onConsentGiven={() => updateAuthState({ needsPrivacyConsent: false })}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Note: supabase is intentionally NOT re-exported here.
// All data access must go through repositories.
export default AuthContext;
