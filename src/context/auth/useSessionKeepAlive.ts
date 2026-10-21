/**
 * Mantiene vivo el token de Supabase mientras la app está abierta:
 * refresco proactivo cada 50 min y al volver a primer plano (con enfriamiento).
 * Si no hay red no hace nada: el token en caché sirve para operar offline.
 * @module context/auth/useSessionKeepAlive
 */
import { useEffect } from 'react';
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';
import { PROACTIVE_REFRESH_MS, shouldRefreshOnVisible, tokenNeedsRefresh } from './authLogic';

export function useSessionKeepAlive(): void {
  useEffect(() => {
    const refreshTimer = setInterval(async () => {
      if (navigator.onLine) {
        logger.info('[Auth] Proactive token refresh (50-min timer)...');
        await supabase.auth.refreshSession().catch(() => {
          logger.warn('[Auth] Proactive refresh failed — will retry next interval');
        });
      }
    }, PROACTIVE_REFRESH_MS);

    let lastVisibilityRefresh = 0;
    const handleVisibilityChange = async () => {
      const now = Date.now();
      if (
        shouldRefreshOnVisible(
          document.visibilityState === 'visible',
          navigator.onLine,
          now,
          lastVisibilityRefresh
        )
      ) {
        lastVisibilityRefresh = now;
        // getSession no va a la red: lee el token guardado
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!tokenNeedsRefresh(data.session?.expires_at, now)) return;
        logger.info('[Auth] App in foreground — token close to expiry, refreshing...');
        await supabase.auth.refreshSession().catch(() => {
          logger.warn('[Auth] Visibility refresh failed');
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
