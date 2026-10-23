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
  await supabase.auth.signOut();
}

/** U6: borra Dexie y localStorage para no filtrar datos en una tablet compartida */
export async function wipeLocalData(): Promise<void> {
  try {
    await db.delete();
  } catch (e) {
    logger.error('[Auth] Dexie wipe failed:', e);
  }
  localStorage.clear();
}
