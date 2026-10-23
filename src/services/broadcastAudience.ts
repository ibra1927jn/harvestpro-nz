/**
 * broadcastAudience — a quién va un aviso del manager (auditoría 23-10, C).
 *
 * El modal de aviso decía «a todo el personal» y guardaba {team_leader, runner}:
 * QC y oficina no lo veían. Ahora se eligen destinatarios; por defecto todos
 * (target_roles vacío = para todos, así lo entiende la RLS de broadcasts).
 */
import { Role } from '@/types';
import type { Broadcast } from '@/types';

export const BROADCAST_AUDIENCES = ['all', 'team_leaders', 'runners', 'qc', 'office'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

const ROLES_OF: Record<Exclude<BroadcastAudience, 'all'>, Role[]> = {
    team_leaders: [Role.TEAM_LEADER],
    runners: [Role.RUNNER],
    qc: [Role.QC_INSPECTOR],
    office: [Role.HR_ADMIN, Role.PAYROLL_ADMIN, Role.LOGISTICS],
};

/** Roles de destino (target_roles) para la selección; [] = todos */
export function rolesForAudiences(selected: ReadonlyArray<BroadcastAudience>): Role[] {
    if (selected.length === 0 || selected.includes('all')) return [];
    const out = new Set<Role>();
    for (const a of selected) {
        if (a !== 'all') ROLES_OF[a].forEach(r => out.add(r));
    }
    return [...out];
}

/** Tocar un destinatario: «todos» excluye al resto; sin ninguno se vuelve a «todos» */
export function toggleAudience(selected: ReadonlyArray<BroadcastAudience>, a: BroadcastAudience): BroadcastAudience[] {
    if (a === 'all') return ['all'];
    const rest = selected.filter(x => x !== 'all');
    const next = rest.includes(a) ? rest.filter(x => x !== a) : [...rest, a];
    return next.length === 0 ? ['all'] : next;
}

/** Aviso sin confirmar por mí (y no enviado por mí): cuenta en la campana */
export function isUnreadBroadcast(b: Pick<Broadcast, 'sender_id' | 'acknowledged_by'>, userId: string | null | undefined): boolean {
    if (!userId) return false;
    if (b.sender_id === userId) return false;
    return !(b.acknowledged_by ?? []).includes(userId);
}

export function countUnreadBroadcasts(
    broadcasts: ReadonlyArray<Pick<Broadcast, 'sender_id' | 'acknowledged_by'>> | null | undefined,
    userId: string | null | undefined,
): number {
    return (broadcasts ?? []).reduce((n, b) => n + (isUnreadBroadcast(b, userId) ? 1 : 0), 0);
}
