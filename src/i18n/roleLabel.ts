/** Nombre del rol en el idioma de la app ('team_leader' → "Team Leader" / "Jefe de equipo"…) */
import type { TFunction } from './index';

const ROLE_KEYS: Record<string, string> = {
    admin: 'roles.admin',
    manager: 'roles.manager',
    team_leader: 'roles.team_leader',
    runner: 'roles.runner',
    qc_inspector: 'roles.qc_inspector',
    hr_admin: 'roles.hr_admin',
    payroll_admin: 'roles.payroll_admin',
    logistics: 'roles.logistics',
    picker: 'roles.picker',
};

export function roleLabel(t: TFunction, role: string | null | undefined): string {
    if (!role) return '';
    const key = ROLE_KEYS[role.toLowerCase()];
    return key ? t(key) : role;
}
