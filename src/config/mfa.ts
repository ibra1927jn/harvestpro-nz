/**
 * Roles que necesitan 2FA (sesión aal2). Misma lista que el servidor:
 * public.mfa_satisfied() (RLS) y requireRole (Edge Functions).
 *
 * Desactivable SOLO en desarrollo con VITE_MFA_ENFORCE=false en .env.local.
 * En build de produccion (import.meta.env.PROD) se ignora y el MFA siempre se exige.
 * La BD también lo exige (migración 20261014000000): en el PC de desarrollo hay
 * que apagarlo además con scripts/dev-disable-mfa.sql.
 */
export const MFA_ENFORCED = import.meta.env.PROD || import.meta.env.VITE_MFA_ENFORCE !== 'false';

const MFA_ROLES: ReadonlySet<string> = new Set(['manager', 'admin', 'payroll_admin', 'hr_admin']);

/** ¿Este rol necesita sesión con 2FA para ver datos? */
export function mfaRequiredFor(role: string | null | undefined): boolean {
  return MFA_ENFORCED && MFA_ROLES.has(role ?? '');
}
