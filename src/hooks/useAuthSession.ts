/**
 * useAuthSession — Extracted auth business logic
 *
 * Encapsulates:
 * - Role determination from DB role string → Role enum
 * - User data loading and orchard auto-assignment
 * - Sentry + PostHog identification
 *
 * Extracted from AuthContext.tsx to reduce its LOC and improve testability.
 *
 * @module hooks/useAuthSession
 */
import { logger } from '@/utils/logger';
import { Role, AppUser } from '@/types';
import { setSentryUser } from '@/config/sentry';
import { analytics } from '@/config/analytics';
import { authContextRepository } from '@/repositories/auth-context.repository';
import type { AuthState } from '@/context/auth.types';
import { canSwitchOwnOrchard } from '@/config/orchardAccess';

// =============================================
// ROLE MAPPING (pure function, easily testable)
// =============================================
const ROLE_MAP: Record<string, Role> = {
  manager: Role.MANAGER,
  team_leader: Role.TEAM_LEADER,
  bucket_runner: Role.RUNNER,
  runner: Role.RUNNER,
  qc_inspector: Role.QC_INSPECTOR,
  payroll_admin: Role.PAYROLL_ADMIN,
  admin: Role.ADMIN,
  hr_admin: Role.HR_ADMIN,
  logistics: Role.LOGISTICS,
};

/** Resolve a DB role string to a Role enum. Returns null if unknown. */
export function resolveRole(dbRole: string | undefined | null): Role | null {
  if (!dbRole) return null;
  return ROLE_MAP[dbRole.toLowerCase()] ?? null;
}

// =============================================
// TRANSIENT ERRORS (pure)
// =============================================
const TRANSIENT_MESSAGE_PARTS = ['504', '502', '503', 'timeout', 'gateway', 'fetch', 'network'];

/**
 * ¿El fallo al leer el perfil es del servidor/red (transitorio) y no "usuario inexistente"?
 * PGRST002 = timeout del pool, PGRST003 = timeout de sentencia.
 */
export function isTransientProfileError(
  error: { message?: string | null; code?: string | number | null } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === 'PGRST002' || code === 'PGRST003') return true;
  const msg = error.message?.toLowerCase() || '';
  return TRANSIENT_MESSAGE_PARTS.some(part => msg.includes(part));
}

// =============================================
// USER DATA LOADER (extracted from AuthContext)
// =============================================
export interface LoadUserResult {
  userData: AppUser | null;
  orchardId: string | null;
}

/**
 * Load user profile from DB, resolve role, auto-assign orchard if needed,
 * and set up Sentry + PostHog identification.
 *
 * Returns the built AuthState partial on success, or throws on failure.
 */
export async function loadUserProfile(userId: string): Promise<{
  stateUpdate: Partial<AuthState>;
  result: LoadUserResult;
}> {
  // 1. Load user from users table
  const { data: userData, error: userError } = await authContextRepository.getUserProfile(userId);

  if (userError || !userData) {
    if (isTransientProfileError(userError)) {
      logger.error('[useAuthSession] Supabase server unreachable:', userError);
      throw new Error('Servidor no disponible. Comprueba tu conexión e inténtalo de nuevo.');
    }

    logger.error('[useAuthSession] User profile not found in DB:', userError);
    throw new Error('User profile not found. Please contact support.');
  }

  // 2. Auto-assign orchard if none — solo roles de empresa / oficina: al personal
  // de campo lo vincula el manager o RRHH (el servidor no deja que se mueva solo)
  let orchardId = userData?.orchard_id;
  if (!orchardId && canSwitchOwnOrchard(userData?.role)) {
    orchardId = await authContextRepository.getFirstOrchardId();
    if (orchardId) {
      await authContextRepository.assignOrchard(userId, orchardId);
    }
  }

  // 3. Role resolution
  const roleEnum = resolveRole(userData?.role);
  if (!roleEnum) {
    logger.warn(
      `[useAuthSession] Unknown role "${userData?.role}" for user ${userId}. Access Denied.`
    );
    throw new Error('Access Denied: You do not have a valid role assigned. Contact Manager.');
  }

  // 4. Set up observability
  // Solo el uuid opaco de auth: nunca email ni nombre hacia Sentry/PostHog (NZ Privacy Act)
  setSentryUser({ id: userId, role: roleEnum ?? undefined });
  analytics.identify(userId, { role: roleEnum, orchard_id: orchardId });

  // 5. Build state update
  const stateUpdate: Partial<AuthState> = {
    // `user` no se toca aquí: lo pone onAuthStateChange/signIn con session.user
    appUser: userData as AppUser,
    currentRole: roleEnum,
    userName: userData?.full_name || '',
    userEmail: userData?.email || '',
    isAuthenticated: true,
    isSetupComplete: true,
    isLoading: false,
    orchardId,
    teamId: userData?.team_id || null,
  };

  return { stateUpdate, result: { userData: userData as AppUser, orchardId } };
}

