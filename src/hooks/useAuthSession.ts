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
    const errMsg = userError?.message?.toLowerCase() || '';
    const errCode = String(userError?.code || '');
    // PGRST002 = pool timeout, PGRST003 = statement timeout — transitorio, no es "user not found"
    const isServerError =
      errCode === 'PGRST002' ||
      errCode === 'PGRST003' ||
      errMsg.includes('504') ||
      errMsg.includes('502') ||
      errMsg.includes('503') ||
      errMsg.includes('timeout') ||
      errMsg.includes('gateway') ||
      errMsg.includes('fetch') ||
      errMsg.includes('network');

    if (isServerError) {
      logger.error('[useAuthSession] Supabase server unreachable:', userError);
      throw new Error('Servidor no disponible. Comprueba tu conexión e inténtalo de nuevo.');
    }

    logger.error('[useAuthSession] User profile not found in DB:', userError);
    throw new Error('User profile not found. Please contact support.');
  }

  // 2. Auto-assign orchard if none
  let orchardId = userData?.orchard_id;
  if (!orchardId) {
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
  // Sentry setUser honours `sendDefaultPii: false` + scrubbing config. PostHog
  // MUST NOT receive email/IRD/bank — NZ Privacy Act 2020 IPP 3. Send only
  // the opaque auth user id plus non-identifying dimensions.
  setSentryUser({ id: userId, email: userData?.email, role: roleEnum ?? undefined });
  analytics.identify(userId, { role: roleEnum, orchard_id: orchardId });

  // 5. Build state update
  const stateUpdate: Partial<AuthState> = {
    user: null, // Will be set by caller with session.user
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

