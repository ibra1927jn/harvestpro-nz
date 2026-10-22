/**
 * harvestMetrics/rowTeams.ts — qué equipo está en cada fila.
 *
 * Una fila "es" de un equipo cuando alguno de sus pickers (presentes en la
 * fila o asignados a ella) pertenece a ese team leader, o cuando la propia
 * asignación lleva `team_leader_id`. Lo usa el mapa del team leader para
 * resaltar las filas de SU equipo y mostrar en gris las de los otros, y la
 * lista «Filas activas» del TL para enseñar solo sus asignaciones.
 */
import type { Picker, RowAssignment } from '@/types';

type Person = Pick<Picker, 'id' | 'role' | 'team_leader_id'> & Partial<Pick<Picker, 'name'>>;

/** Team leader de una persona: ella misma si es team leader, si no su team_leader_id */
function leaderOf(p: Person): string | null {
    if (p.role === 'team_leader') return p.id;
    return p.team_leader_id ?? null;
}

/**
 * Team leaders con gente (o asignación) en una fila.
 * `rowPickers` son los que están trabajando ahora en la fila (mapa);
 * `rowAssignments` todas las asignaciones del huerto (se filtran por fila).
 */
export function teamLeadersOnRow<T extends Person>(
    rowNum: number,
    rowPickers: T[],
    rowAssignments: Pick<RowAssignment, 'row_number' | 'assigned_pickers' | 'team_leader_id'>[],
    crew: T[],
): Set<string> {
    const leaders = new Set<string>();
    for (const p of rowPickers) {
        const l = leaderOf(p);
        if (l) leaders.add(l);
    }
    const byId = new Map(crew.map(p => [p.id, p] as const));
    for (const ra of rowAssignments) {
        if (ra.row_number !== rowNum) continue;
        if (ra.team_leader_id) leaders.add(ra.team_leader_id);
        for (const pid of ra.assigned_pickers) {
            const p = byId.get(pid);
            const l = p ? leaderOf(p) : null;
            if (l) leaders.add(l);
        }
    }
    return leaders;
}

/** Realce de una fila en el mapa del team leader */
export type RowTeamHighlight =
    | { kind: 'mine' }
    | { kind: 'other'; leaderNames: string[] };

/**
 * Cómo se pinta la fila para el team leader `teamLeaderId`:
 * - 'mine'  → mi equipo está en la fila (gana aunque haya otros equipos)
 * - 'other' → solo hay otros equipos; `leaderNames` son sus team leaders
 *             (los que estén en la plantilla; puede quedar vacío)
 * - null    → nadie / sin equipo conocido
 */
export function rowTeamHighlight<T extends Person>(
    teamLeaderId: string,
    rowNum: number,
    rowPickers: T[],
    rowAssignments: Pick<RowAssignment, 'row_number' | 'assigned_pickers' | 'team_leader_id'>[],
    crew: T[],
): RowTeamHighlight | null {
    const leaders = teamLeadersOnRow(rowNum, rowPickers, rowAssignments, crew);
    if (leaders.size === 0) return null;
    if (leaders.has(teamLeaderId)) return { kind: 'mine' };
    const leaderNames = Array.from(leaders)
        .map(id => crew.find(p => p.id === id && p.role === 'team_leader')?.name)
        .filter((n): n is string => !!n);
    return { kind: 'other', leaderNames };
}

/**
 * Asignaciones de filas del equipo de un team leader: las que llevan su
 * `team_leader_id` o incluyen a alguno de sus pickers (o a él mismo).
 */
export function selectTeamRowAssignments<R extends Pick<RowAssignment, 'assigned_pickers' | 'team_leader_id'>>(
    rowAssignments: R[],
    crew: Person[],
    teamLeaderId: string | null | undefined,
): R[] {
    if (!teamLeaderId) return [];
    const mine = new Set(crew.filter(p => leaderOf(p) === teamLeaderId).map(p => p.id));
    mine.add(teamLeaderId);
    return rowAssignments.filter(ra =>
        ra.team_leader_id === teamLeaderId || ra.assigned_pickers.some(id => mine.has(id)),
    );
}
