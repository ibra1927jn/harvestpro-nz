/**
 * ¿Quién cambia su PROPIO huerto? Solo los roles de empresa / oficina
 * (admin, manager, RRHH, nómina). Al personal de campo (team leader, runner,
 * QC, logística) lo vincula a un huerto el manager o RRHH. Misma lista que el
 * servidor: trigger guard_user_changes (migración 20261023013000).
 */
const SELF_ORCHARD_SWITCH_ROLES: ReadonlySet<string> = new Set(['admin', 'manager', 'hr_admin', 'payroll_admin']);

export function canSwitchOwnOrchard(role: string | null | undefined): boolean {
  return SELF_ORCHARD_SWITCH_ROLES.has(role ?? '');
}
