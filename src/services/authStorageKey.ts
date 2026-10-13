/**
 * authStorageKey.ts — clave de sesión de Supabase por pestaña.
 *
 * Cada pestaña usa su propia clave (sb-harvestpro-auth-<tabId>) para que las
 * pestañas no se sincronicen entre sí. El tabId vive en sessionStorage, que se
 * borra cuando el sistema cierra la PWA (Android lo hace a menudo en segundo
 * plano). Al volver a abrir, se adopta la sesión guardada más reciente en vez
 * de crear una clave nueva: si no, el usuario quedaba deslogueado y, sin
 * cobertura, no podía volver a entrar.
 */
export const AUTH_KEY_PREFIX = 'sb-harvestpro-auth-';
export const TAB_ID_KEY = 'harvestpro_tab_id';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

/** Caducidad (segundos epoch) de la sesión guardada bajo una clave; 0 si no vale. */
function sessionExpiry(local: KV, key: string): number {
  try {
    const raw = local.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { expires_at?: number; refresh_token?: string };
    // Con refresh_token la sesión se puede renovar aunque el access token haya caducado
    if (!parsed?.refresh_token) return 0;
    return typeof parsed.expires_at === 'number' ? parsed.expires_at : 1;
  } catch {
    return 0;
  }
}

/** Busca la sesión persistida más reciente y devuelve su tabId. */
function latestPersistedTabId(local: KV): string | null {
  let best: { tabId: string; exp: number } | null = null;
  for (let i = 0; i < local.length; i++) {
    const key = local.key(i);
    if (!key || !key.startsWith(AUTH_KEY_PREFIX)) continue;
    const tabId = key.slice(AUTH_KEY_PREFIX.length);
    // Ignora claves auxiliares de supabase-js (p. ej. "-code-verifier", "-user")
    if (!tabId.startsWith('tab_') || tabId.includes('-')) continue;
    const exp = sessionExpiry(local, key);
    if (exp > 0 && (!best || exp > best.exp)) best = { tabId, exp };
  }
  return best?.tabId ?? null;
}

/** tabId de esta pestaña: el suyo, el de la última sesión guardada, o uno nuevo. */
export function resolveAuthTabId(session: KV | null, local: KV | null): string {
  const existing = session?.getItem(TAB_ID_KEY);
  if (existing) return existing;
  const adopted = local ? latestPersistedTabId(local) : null;
  const tabId =
    adopted ?? `tab_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  session?.setItem(TAB_ID_KEY, tabId);
  return tabId;
}
