// =============================================
// SINGLE SUPABASE CLIENT
// =============================================
// IMPORTANT: This file ONLY exports the client.
// Do NOT create contexts or providers here.
// All other files should import from here.
// =============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config.service';
import { AUTH_KEY_PREFIX, resolveAuthTabId } from './authStorageKey';
import { pushAwareFetch } from './pushKick';

// Get configuration (will throw in production if env vars missing)
const config = getConfig();
const SUPABASE_URL = config.SUPABASE_URL;
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

// Clave de sesión por pestaña (sin sync entre pestañas). Al reabrir la PWA
// (sessionStorage vacío) se adopta la última sesión guardada: ver authStorageKey.ts
const tabId = resolveAuthTabId(
  typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  typeof localStorage !== 'undefined' ? localStorage : null
);

// Single client — do NOT create additional instances in other files
// Uses localStorage so sessions survive tab close/reopen (critical for field workers in low-signal zones)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    storageKey: `${AUTH_KEY_PREFIX}${tabId}`, // Unique per tab to disable BroadcastChannel sync
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  // Tras escribir un evento que avisa a otros, despierta send-push (pushKick.ts)
  global: {
    fetch: pushAwareFetch(() => supabase.functions.invoke('send-push', { body: { action: 'flush' } })),
  },
});

// Export URL and KEY in case they're needed elsewhere
export { SUPABASE_URL, SUPABASE_ANON_KEY };
