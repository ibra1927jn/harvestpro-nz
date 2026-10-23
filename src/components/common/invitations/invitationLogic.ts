/**
 * Lógica pura de la pantalla «Invitar» (estado de cada invitación, enlace de
 * registro, roles que puede invitar cada uno).
 * @module components/common/invitations/invitationLogic
 */
import type { InvitationRow } from '@/repositories/invitations.repository';

export type InvitationStatus = 'pending' | 'used' | 'expired';

/** Orden de los roles en el selector */
export const INVITABLE_ROLES = [
    'team_leader', 'runner', 'qc_inspector', 'logistics', 'manager', 'hr_admin', 'payroll_admin', 'admin',
] as const;

/** Roles que puede invitar quien está en la pantalla: RRHH todos menos admin */
export function invitableRoles(canInviteAdmin: boolean): string[] {
    return INVITABLE_ROLES.filter(r => canInviteAdmin || r !== 'admin');
}

export function invitationStatus(inv: Pick<InvitationRow, 'used_at' | 'expires_at'>, now: Date = new Date()): InvitationStatus {
    if (inv.used_at) return 'used';
    if (inv.expires_at && new Date(inv.expires_at).getTime() <= now.getTime()) return 'expired';
    return 'pending';
}

/** Email con forma válida (lo mismo que pide el registro) */
export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Enlace que se manda a la persona: abre «Registrarse» con su email puesto */
export function signupLink(email: string, origin: string): string {
    return `${origin.replace(/\/$/, '')}/login?invite=${encodeURIComponent(email.trim().toLowerCase())}`;
}

/** Email de la invitación en la URL (?invite=…), o null */
export function inviteEmailFromSearch(search: string): string | null {
    const v = new URLSearchParams(search).get('invite');
    return v && isValidEmail(v) ? v.trim().toLowerCase() : null;
}

/** Cuenta por estado, para las pestañas de la lista */
export function countByStatus(rows: InvitationRow[], now: Date = new Date()): Record<InvitationStatus, number> {
    const out: Record<InvitationStatus, number> = { pending: 0, used: 0, expired: 0 };
    for (const r of rows) out[invitationStatus(r, now)]++;
    return out;
}

/** Mensaje claro para los errores típicos de la BD al invitar */
export function invitationErrorKey(err: unknown): string {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === '23505' || /duplicate key|allowed_registrations_email_key/i.test(msg)) return 'invite.err.duplicate';
    if (code === '42501' || /not allowed to invite|row-level security/i.test(msg)) return 'invite.err.not_allowed';
    return 'invite.err.generic';
}
