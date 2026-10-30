/**
 * Acciones de autenticación sin estado React: registro con lista blanca,
 * reset de contraseña y limpieza al cerrar sesión.
 * Extraídas de AuthContext.tsx (que sigue siendo la única excepción S-1
 * que usa `supabase` directamente; este módulo forma parte de ella).
 * @module context/auth/authActions
 */
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';
import { db } from '@/services/db';
import { syncService } from '@/services/sync.service';
import { notificationService } from '@/services/notification.service';
import { clearSentryUser } from '@/config/sentry';
import { analytics } from '@/config/analytics';
import { authContextRepository } from '@/repositories/auth-context.repository';
import { clearDeviceTrust } from '@/services/deviceTrust.service';
import { edgeFunctionWarmupService } from '@/services/edgeFunctionWarmup.service';
import {
  normalizeEmail,
  pendingSignOutMessage,
  resolveWhitelistRegistration,
} from './authLogic';

/**
 * Registro: el email debe estar autorizado por RRHH (allowed_registrations).
 * El rol y el huerto salen de la invitación; Supabase envía la confirmación.
 */
export async function registerWithWhitelist(
  email: string,
  password: string,
  fullName: string
): Promise<void> {
  // 1. Lista blanca
  const { data: registration, error: regError } = await authContextRepository.checkWhitelist(email);
  if (regError) logger.error('[Auth] Whitelist lookup failed:', regError);
  const { registrationId, role, orchardId } = resolveWhitelistRegistration(registration, regError);

  // 2. Usuario de Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });
  if (error) throw error;
  if (!data.user) return;

  // 3. Perfil en public.users con el rol asignado por RRHH
  await authContextRepository.insertUser({
    id: data.user.id,
    email: normalizeEmail(email),
    full_name: fullName,
    role,
    orchard_id: orchardId,
    is_active: true,
  });
  // 4. Marcar la invitación como usada
  await authContextRepository.markRegistrationUsed(registrationId);
  logger.info(`[Auth] User registered via whitelist: ${email} as ${role}`);
}

/** Email de reset de contraseña vía Supabase */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}

/**
 * V27: si hay registros sin sincronizar pide confirmación explícita.
 * Devuelve false si el usuario cancela el cierre de sesión.
 */
export async function confirmSignOutWithPendingData(): Promise<boolean> {
  const pendingCount = await syncService.getPendingCount();
  if (pendingCount === 0) return true;
  if (!window.confirm(pendingSignOutMessage(pendingCount))) return false;
  logger.warn(`[Auth] User forced sign-out with ${pendingCount} pending items — DATA WILL BE LOST`);
  return true;
}

/** Para servicios en segundo plano y cierra la sesión de Supabase */
export async function teardownSession(userId: string | undefined): Promise<void> {
  // R9-Fix7: parar el temporizador evita 401 tras el logout
  notificationService.stopChecking();
  clearSentryUser();
  analytics.trackLogout();
  // No consumir llamadas de warmup tras el logout
  edgeFunctionWarmupService.stop();
  // Confianza MFA del dispositivo (web + Android)
  if (userId) await clearDeviceTrust(userId);
  // Este móvil deja de recibir los avisos push de esta cuenta (con la sesión
  // aún válida: la fila solo la puede borrar su dueño). Sin red no espera más de 3 s.
  await Promise.race([
    import('@/services/push.service').then(m => m.pushService.forgetDevice()).catch(() => undefined),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
  // U6: cerrar canales realtime ANTES de borrar la sesión
  supabase.removeAllChannels();
  // Alcance local a propósito (no 'global'): cada pestaña tiene su propia sesión
  // (authStorageKey.ts) y 'global' cerraría también los otros móviles de la persona,
  // que pueden tener fichajes o cubetas sin subir y quedarse sin poder entrar sin
  // cobertura; MFAGuard además llama a signOut al cancelar el 2FA. Lo que queda en
  // ESTE dispositivo lo borra wipeLocalData.
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * U6: borra todo lo que la sesión deja en el dispositivo para no filtrar datos en
 * una tablet compartida: Dexie, la Cache Storage (el service worker guarda ahí
 * respuestas de la API en `supabase-api-cache`, además de imágenes y chunks),
 * localStorage y sessionStorage. Cada paso es independiente: si uno falla, los
 * demás se hacen igual.
 */
export async function wipeLocalData(): Promise<void> {
  try {
    await db.delete();
  } catch (e) {
    logger.error('[Auth] Dexie wipe failed:', e);
  }
  try {
    // Sin contexto seguro (http) no existe `caches`
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }
  } catch (e) {
    logger.error('[Auth] Cache Storage wipe failed:', e);
  }
  try {
    localStorage.clear();
  } catch (e) {
    logger.error('[Auth] localStorage wipe failed:', e);
  }
  try {
    sessionStorage.clear();
  } catch (e) {
    logger.error('[Auth] sessionStorage wipe failed:', e);
  }
}
