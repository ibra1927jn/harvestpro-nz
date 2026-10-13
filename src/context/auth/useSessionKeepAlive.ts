/**
 * Mantiene vivo el token de Supabase mientras la app está abierta:
 * refresco proactivo cada 50 min y al volver a primer plano (con enfriamiento).
 * Si no hay red no hace nada: el token en caché sirve para operar offline.
 * @module context/auth/useSessionKeepAlive
 */
import { useEffect } from 'react';
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';
import { PROACTIVE_REFRESH_MS, shouldRefreshOnVisible } from './authLogic';

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
        logger.info('[Auth] App in foreground — ensuring token health...');
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
