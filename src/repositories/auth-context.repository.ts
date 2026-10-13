/**
 * Auth Context Repository — user profile lookups and registration queries
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import { db } from '@/services/db';

/** TTL para el cache de perfil de auth: 7 días en ms */
const AUTH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const authContextRepository = {
  /** Get user profile by ID with retry on 504/502/PGRST003.
   *  Máximo 3 intentos (0,1,2). Si todos fallan con error transitorio,
   *  intenta devolver el perfil desde auth_cache (Dexie) con TTL de 7 días. */
  async getUserProfile(userId: string) {
    let userData = null;
    let userError = null;
    let isTransientFailure = false;

    for (let attempt = 0; attempt <= 2; attempt++) {
      logger.info(`[CONN-TRACE] getUserProfile intento ${attempt + 1}/3`);
      const result = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      userData = result.data;
      userError = result.error;
      if (userData || !userError) break;
      const errMsg = String(userError?.message || '').toLowerCase();
      const errCode = String(userError?.code || '');
      // PGRST002 = pool timeout, PGRST003 = statement timeout — ambos son transitorios
      const isRetriable =
        errCode === 'PGRST002' ||
        errCode === 'PGRST003' ||
        errMsg.includes('504') ||
        errMsg.includes('502') ||
        errMsg.includes('503') ||
        errMsg.includes('timeout') ||
        errMsg.includes('gateway') ||
        errMsg.includes('fetch') ||
        errMsg.includes('network');
      if (!isRetriable) break;
      isTransientFailure = true;
      if (attempt === 2) break; // último intento agotado
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Login exitoso — actualizar cache con perfil fresco
    if (userData) {
      db.auth_cache.put({
        id: userId,
        profile: userData as Record<string, unknown>,
        orchard_id: (userData as Record<string, unknown>).orchard_id as string | null ?? null,
        cached_at: Date.now(),
      }).catch(() => {}); // silencioso — el cache es best-effort
      return { data: userData, error: userError };
    }

    // Todos los reintentos fallaron con error transitorio — intentar cache Dexie
    if (isTransientFailure) {
      try {
        const cached = await db.auth_cache.get(userId);
        if (cached && (Date.now() - cached.cached_at) < AUTH_CACHE_TTL_MS) {
          const ageHours = Math.round((Date.now() - cached.cached_at) / 3_600_000);
          logger.warn(`[AuthRepo] Supabase timeout — usando perfil cacheado (antigüedad: ${ageHours}h). El usuario podrá entrar aunque el pool esté agotado.`);
          return { data: cached.profile, error: null };
        }
      } catch {
        // Dexie no disponible (primer uso, storage bloqueado, etc.) — continúa con el error original
      }
    }

    return { data: userData, error: userError };
  },

  /** Get first orchard id */
  async getFirstOrchardId() {
    const { data } = await supabase.from('orchards').select('id').limit(1).maybeSingle();
    return data?.id || null;
  },

  /** Get all orchards accessible to the user */
  async getAllOrchards() {
    const { data, error } = await supabase
      .from('orchards')
      .select('id, name, total_rows')
      .order('name');
    if (error) return [];
    return data || [];
  },

  /** Get orchard by ID */
  async getOrchardById(orchardId: string) {
    const { data } = await supabase
      .from('orchards')
      .select('id, name, total_rows')
      .eq('id', orchardId)
      .maybeSingle();
    return data;
  },

  /** Assign orchard to user */
  async assignOrchard(userId: string, orchardId: string) {
    await supabase.from('users').update({ orchard_id: orchardId }).eq('id', userId);
  },

  /** Check allowed_registrations whitelist */
  async checkWhitelist(email: string) {
    // Función del servidor: devuelve solo la invitación de este email
    const { data, error } = await supabase.rpc('check_registration', {
      p_email: email.toLowerCase().trim(),
    });
    const rows = (data ?? []) as {
      id: string;
      role: string | null;
      orchard_id: string | null;
      used_at: string | null;
    }[];
    return { data: rows[0] ?? null, error };
  },

  /** Insert new user profile */
  async insertUser(record: Record<string, unknown>) {
    await supabase.from('users').insert(record);
  },

  /** Mark registration as used */
  async markRegistrationUsed(registrationId: string) {
    await supabase
      .from('allowed_registrations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', registrationId);
  },
};
