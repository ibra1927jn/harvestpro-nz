/**
 * clearBrowserState — purge all per-user browser state on logout.
 *
 * Previously, logout only cleared Dexie + localStorage. Left behind on a
 * shared/BYOD device:
 *   - Cache Storage API (Workbox precache + runtime API caches)
 *   - sessionStorage
 *   - react-query in-memory cache
 *   - axios/fetch response caches held by SPA modules (handled by page reload)
 *
 * Effect: the next user signing in on the same device could see the
 * previous user's dashboards, API responses, or offline-first reads until
 * the stale cache expired — a Privacy Act 2020 IPP 11 breach and
 * potentially a reportable notifiable privacy breach when wage data is
 * involved.
 *
 * This helper runs every cleanup step in parallel where safe and
 * independently catches each so a failure in one does not block the
 * others. It is called BEFORE `window.location.reload()` in signOut.
 *
 * @module utils/clearBrowserState
 */
import { logger } from '@/utils/logger';
import { queryClient } from '@/config/queryClient';

/** Delete every named cache from the Cache Storage API. */
async function clearAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) {
    logger.warn('[logout] caches.delete failed:', (e as Error).message);
  }
}

/** Clear the react-query in-memory + persisted cache. */
function clearQueryCache(): void {
  try {
    queryClient.clear();
  } catch (e) {
    logger.warn('[logout] queryClient.clear failed:', (e as Error).message);
  }
}

/** sessionStorage is per-tab — wipe the current tab's worth. */
function clearSessionStorage(): void {
  try {
    sessionStorage.clear();
  } catch (e) {
    logger.warn('[logout] sessionStorage.clear failed:', (e as Error).message);
  }
}

/**
 * Purge every per-user browser state we know about. Safe to call multiple
 * times; each step is independently best-effort.
 *
 * Note: we intentionally do NOT call `serviceWorker.unregister()`. Doing
 * so would force the next user to re-download the full PWA shell; the
 * data-safety goal is met by clearing Cache Storage + Dexie + storages.
 */
export async function clearBrowserStateOnLogout(): Promise<void> {
  clearQueryCache();
  clearSessionStorage();
  await clearAllCaches();
}
