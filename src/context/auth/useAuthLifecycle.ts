/**
 * Ciclo de vida de la sesión: comprobación inicial (reapertura de la PWA)
 * y escucha de onAuthStateChange (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED).
 * @module context/auth/useAuthLifecycle
 */
import { useEffect, type MutableRefObject } from 'react';
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync.service';
import type { AuthState } from '../auth.types';
import { decideAuthChange } from './authLogic';

interface AuthLifecycleDeps {
  /** Ref al valor actual de isAuthenticated (BUG-1: evita el closure obsoleto) */
  isAuthenticatedRef: MutableRefObject<boolean>;
  loadUserData: (userId: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  updateAuthState: (updates: Partial<AuthState>) => void;
}

/** Sesión perdida: si hay pendientes se intenta refrescar o se pide re-auth, nunca signOut */
async function handleSessionLost(deps: AuthLifecycleDeps): Promise<void> {
  // R8-Fix2: signOut() con pendientes provocaba el bloqueo guard V27 + borrado de Dexie
  const pendingCount = await syncService.getPendingCount();
  if (pendingCount === 0) {
    deps.signOut();
    return;
  }
  // R9-Fix11: intentar refreshSession() primero
  const { data: refreshData } = await supabase.auth.refreshSession();
  if (refreshData?.session) {
    logger.info(`[Auth] Session refreshed silently — ${pendingCount} pending items safe`);
    deps.loadUserData(refreshData.session.user.id);
  } else {
    logger.warn(
      `[Auth] Session expired, refresh failed, ${pendingCount} pending items — showing re-auth modal`
    );
    deps.updateAuthState({ needsReAuth: true });
  }
}

export function useAuthLifecycle(deps: AuthLifecycleDeps): void {
  useEffect(() => {
    // 1. Sesión guardada al arrancar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        deps.loadUserData(session.user.id);
      } else {
        deps.updateAuthState({ isLoading: false });
      }
    });

    // 2. Cambios de sesión
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const action = decideAuthChange(
        event,
        !!session?.user,
        !!session,
        deps.isAuthenticatedRef.current
      );
      if (event === 'TOKEN_REFRESHED') {
        logger.info('[Auth] Token refreshed silently in background');
      }
      if (action === 'load-session-user' && session?.user) {
        deps.loadUserData(session.user.id);
        // BUG-2: guardar el User completo de la sesión
        deps.updateAuthState({ user: session.user });
      } else if (action === 'session-lost') {
        await handleSessionLost(deps);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar: la suscripción no debe re-suscribirse con cada cambio de estado
}
