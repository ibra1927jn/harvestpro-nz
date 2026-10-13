/**
 * Lógica pura del modal para vincular personal (team leaders / runners) a un huerto.
 * @module components/modals/staff-selection/staffSelectionLogic
 */
export interface StaffInfo {
    id: string;
    full_name: string;
    role: string;
    orchard_id?: string;
}

export type StaffFilter = 'all' | 'team_leader' | 'runner';

type StaffRow = { id: string; full_name: string; orchard_id?: string };

/** Une líderes y runners en una lista con su rol */
export function mergeStaff(leaders: StaffRow[] | null | undefined, runners: StaffRow[] | null | undefined): StaffInfo[] {
    return [
        ...(leaders || []).map(l => ({ ...l, role: 'team_leader' })),
        ...(runners || []).map(r => ({ ...r, role: 'runner' })),
    ];
}

/** Filtra por rol y luego por nombre (sin distinguir mayúsculas) */
export function filterStaff(staff: StaffInfo[], filter: StaffFilter, searchQuery: string): StaffInfo[] {
    let result = filter === 'all' ? staff : staff.filter(s => s.role === filter);
    const q = searchQuery.toLowerCase().trim();
    if (q) result = result.filter(s => s.full_name?.toLowerCase().includes(q));
    return result;
}

/** "Seleccionar todo" solo marca a quien aún no está en este huerto */
export function selectableIds(staff: StaffInfo[], orchardId: string | undefined): Set<string> {
    return new Set(staff.filter(s => s.orchard_id !== orchardId).map(s => s.id));
}

export function toggleId(ids: Set<string>, id: string): Set<string> {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

/** Aviso tras vincular en lote */
export function batchAssignToast(successCount: number, failCount: number): { message: string; type: 'warning' | 'success' } {
    if (failCount > 0) return { message: `Linked ${successCount} staff. ${failCount} failed.`, type: 'warning' };
    return {
        message: `Successfully linked ${successCount} staff member${successCount > 1 ? 's' : ''}.`,
        type: 'success',
    };
}

/** Texto de lista vacía */
export function emptyStaffMessage(searchQuery: string, filter: StaffFilter): string {
    if (searchQuery) return `No results for "${searchQuery}"`;
    if (filter === 'all') return 'No staff found in the system.';
    return `No ${filter === 'team_leader' ? 'Team Leaders' : 'Runners'} found.`;
}

export const roleLabel = (role: string) => (role === 'team_leader' ? 'Team Leader' : 'Bucket Runner');
export const roleColor = (role: string) =>
    role === 'team_leader' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700';
export const roleIcon = (role: string) => (role === 'team_leader' ? 'groups' : 'local_shipping');

export const initials = (name: string | undefined) => name?.substring(0, 2).toUpperCase() || '??';

export const countRole = (staff: StaffInfo[], role: string) => staff.filter(s => s.role === role).length;
