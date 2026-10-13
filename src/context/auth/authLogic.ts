/**
 * Lógica pura de autenticación (sin React, sin Supabase).
 * Extraída de AuthContext.tsx para poder testearla aislada.
 * @module context/auth/authLogic
 */
import { Role } from '@/types';
import type { AuthState } from '../auth.types';

/** Estado inicial del proveedor: cargando, sin sesión */
export const INITIAL_AUTH_STATE: AuthState = {
  user: null,
  appUser: null,
  isAuthenticated: false,
  isLoading: true,
  isSetupComplete: false,
  currentRole: null,
  userName: '',
  userEmail: '',
  orchardId: null,
  orchardName: '',
  availableOrchards: [],
  teamId: null,
  needsReAuth: false,
  needsPrivacyConsent: false,
};

/** Estado tras un fallo crítico al cargar el perfil */
export const FAILED_PROFILE_LOAD_STATE: Partial<AuthState> = {
  user: null,
  appUser: null,
  isLoading: false,
  isAuthenticated: false,
  currentRole: null,
};

// Refresco proactivo: el token caduca a los 60 min
export const PROACTIVE_REFRESH_MS = 50 * 60 * 1000;
// Enfriamiento del refresco al volver a primer plano (evita HTTP 429)
export const VISIBILITY_REFRESH_COOLDOWN_MS = 180_000;

export interface WhitelistRegistration {
  id: string;
  role: string | null;
  orchard_id: string | null;
  used_at: string | null;
}

export const WHITELIST_ERRORS = {
  lookupFailed: 'Error al verificar autorización. Inténtalo de nuevo.',
  notAuthorized: 'Tu email no está autorizado. Contacta con RRHH para que te den acceso.',
  alreadyUsed:
    'Este email ya ha sido registrado. Usa "Iniciar Sesión" o "¿Olvidaste tu contraseña?"',
} as const;

/**
 * Valida la entrada de la lista blanca de RRHH.
 * Lanza el error que ve el usuario o devuelve el rol y huerto autorizados.
 */
export function resolveWhitelistRegistration(
  registration: WhitelistRegistration | null | undefined,
  lookupError: unknown
): { registrationId: string; role: Role; orchardId: string | null } {
  if (lookupError) throw new Error(WHITELIST_ERRORS.lookupFailed);
  if (!registration) throw new Error(WHITELIST_ERRORS.notAuthorized);
  if (registration.used_at) throw new Error(WHITELIST_ERRORS.alreadyUsed);
  return {
    registrationId: registration.id,
    role: registration.role as Role,
    orchardId: registration.orchard_id,
  };
}

/** Email tal como se guarda en public.users */
export const normalizeEmail = (email: string): string => email.toLowerCase().trim();

/** Texto del confirm() cuando hay registros sin sincronizar al cerrar sesión */
export function pendingSignOutMessage(pendingCount: number): string {
  return (
    `⚠️ ALERTA CRÍTICA: Tienes ${pendingCount} registros sin sincronizar.\n\n` +
    `Si cierras sesión ahora, estos datos se perderán permanentemente ` +
    `(incluyendo información de nómina).\n\n` +
    `Conecta a internet y espera a que todo se sincronice antes de cerrar sesión.\n\n` +
    `¿Estás SEGURO de que quieres cerrar sesión y PERDER estos datos?`
  );
}

/** Qué hacer ante un evento de onAuthStateChange */
export type AuthChangeAction = 'ignore' | 'load-session-user' | 'session-lost';

export function decideAuthChange(
  event: string,
  hasSessionUser: boolean,
  hasSession: boolean,
  isAuthenticated: boolean
): AuthChangeAction {
  // Renovación silenciosa: no recargar ni cerrar sesión
  if (event === 'TOKEN_REFRESHED') return 'ignore';
  if (hasSessionUser && !isAuthenticated) return 'load-session-user';
  if (!hasSession && isAuthenticated) return 'session-lost';
  return 'ignore';
}

/** ¿Toca refrescar el token al volver la app a primer plano? */
export function shouldRefreshOnVisible(
  visible: boolean,
  online: boolean,
  now: number,
  lastRefresh: number,
  cooldownMs: number = VISIBILITY_REFRESH_COOLDOWN_MS
): boolean {
  return visible && online && now - lastRefresh > cooldownMs;
}

/** Ley de Privacidad NZ 2020: falta consentimiento si nunca se registró */
export function needsPrivacyConsent(
  profile: { privacy_consent_at?: string | null } | null | undefined
): boolean {
  return !!profile && !profile.privacy_consent_at;
}

/** Nombre del huerto actual dentro de la lista disponible ('' si no está) */
export function orchardNameFor(
  orchards: ReadonlyArray<{ id: string; name: string }>,
  orchardId: string | null | undefined
): string {
  return orchards.find(o => o.id === orchardId)?.name || '';
}
