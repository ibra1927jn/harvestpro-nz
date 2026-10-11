/**
 * harvestMetrics/roster.ts — LA definición de "quién es quién" para todas las pantallas.
 *
 * Una sola lista de personas por huerto (tabla pickers, cargada en el store como
 * `crew`): pickers, team leaders y runners. Toda pantalla de todo rol cuenta y
 * lista gente con estas funciones, así un mismo momento da las mismas cifras en
 * Panel, Equipos, Mapa, Runner, Team Leader, QC, HR y Nómina.
 *
 * Reglas:
 * - Plantilla = status 'active' (situación laboral; 'archived' = baja).
 * - Presente hoy = ha fichado hoy y no ha fichado la salida (daily_attendance).
 * - Team leader de un picker = la persona cuyo id es picker.team_leader_id
 *   (el id de la cuenta del team leader, que es también su fila en la lista).
 */
import { Picker } from '@/types';

type Person = Pick<Picker, 'id' | 'role' | 'status' | 'team_leader_id'> &
    Partial<Pick<Picker, 'checked_in_today' | 'check_in' | 'check_out'>>;

const isStaff = (p: Person) => p.status !== 'archived' && p.status !== 'inactive' && p.status !== 'suspended';
const isPickerRole = (p: Person) => !p.role || p.role === 'picker';
const isRunnerRole = (p: Person) => p.role === 'runner' || p.role === 'bucket_runner';

/** Plantilla del huerto: todos los que siguen trabajando (pickers, TLs, runners) */
export function selectStaff<T extends Person>(crew: T[]): T[] {
    return crew.filter(isStaff);
}

/** Pickers de la plantilla (sin team leaders ni runners) */
export function selectPickers<T extends Person>(crew: T[]): T[] {
    return crew.filter(p => isStaff(p) && isPickerRole(p));
}

/** Team leaders de la plantilla */
export function selectTeamLeaders<T extends Person>(crew: T[]): T[] {
    return crew.filter(p => isStaff(p) && p.role === 'team_leader');
}

/** Runners de la plantilla (runner y bucket_runner son lo mismo) */
export function selectRunners<T extends Person>(crew: T[]): T[] {
    return crew.filter(p => isStaff(p) && isRunnerRole(p));
}

/** ¿Está trabajando ahora? Ha fichado hoy y no ha fichado la salida */
export function isPresentToday(p: Person): boolean {
    return !!(p.checked_in_today || p.check_in) && !p.check_out;
}

/** Plantilla presente hoy (fichada y sin salida) */
export function selectPresentToday<T extends Person>(crew: T[]): T[] {
    return crew.filter(p => isStaff(p) && isPresentToday(p));
}

/** Pickers presentes hoy */
export function selectPresentPickers<T extends Person>(crew: T[]): T[] {
    return crew.filter(p => isStaff(p) && isPickerRole(p) && isPresentToday(p));
}

/** Equipo de un team leader: sus pickers (sin él mismo) */
export function selectTeamOf<T extends Person>(crew: T[], teamLeaderId: string | undefined | null): T[] {
    if (!teamLeaderId) return [];
    return crew.filter(p => isStaff(p) && isPickerRole(p) && p.team_leader_id === teamLeaderId && p.id !== teamLeaderId);
}

/** Pickers sin team leader asignado (o con uno que ya no está en la plantilla) */
export function selectUnassigned<T extends Person>(crew: T[]): T[] {
    const leaderIds = new Set(selectTeamLeaders(crew).map(t => t.id));
    return crew.filter(p => isStaff(p) && isPickerRole(p) && (!p.team_leader_id || !leaderIds.has(p.team_leader_id)));
}

/** Team leader de una persona, si está en la plantilla */
export function findTeamLeader<T extends Person>(crew: T[], person: Pick<Person, 'team_leader_id'> | undefined): T | undefined {
    if (!person?.team_leader_id) return undefined;
    return crew.find(p => p.id === person.team_leader_id && p.role === 'team_leader');
}

// ── Nombres antiguos (mismo significado que arriba) ─────────────────────────

/** @deprecated usar selectStaff */
export const selectActiveCrew = selectStaff;
/** @deprecated usar selectPickers */
export const selectActivePickers = selectPickers;
/** Toda la lista cargada, sin filtrar */
export function selectAllStaff<T>(crew: T[]): T[] {
    return crew;
}
