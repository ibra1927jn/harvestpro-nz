/**
 * Lógica pura de ausencias (sin Supabase): la usan el servicio y las pantallas
 * que no deben cargar el repositorio al importarse (pase de lista, Equipos, Nómina).
 */
import type { ValidatedLeaveRequest } from '@/schemas/zod.schemas';

type LeaveRequest = ValidatedLeaveRequest;
type LeaveType = LeaveRequest['type'];

/** ¿La ausencia cubre esa fecha (YYYY-MM-DD)? */
export function leaveCoversDate(leave: Pick<LeaveRequest, 'start_date' | 'end_date'>, ymd: string): boolean {
    return leave.start_date <= ymd && ymd <= leave.end_date;
}

/**
 * Personas con una ausencia aprobada que cubre la fecha dada (→ on_leave en RRHH,
 * «De permiso» en el pase de lista del team leader, en Equipos y en Nómina).
 */
export function onLeaveOn(leaves: ReadonlyArray<LeaveRequest>, ymd: string): Set<string> {
    const out = new Set<string>();
    for (const l of leaves) {
        if (l.status === 'approved' && leaveCoversDate(l, ymd)) out.add(l.picker_id);
    }
    return out;
}

/** La ausencia aprobada de cada persona ese día (para enseñar el tipo) */
export function leaveByPickerOn(leaves: ReadonlyArray<LeaveRequest>, ymd: string): Map<string, LeaveRequest> {
    const out = new Map<string, LeaveRequest>();
    for (const l of leaves) {
        if (l.status === 'approved' && leaveCoversDate(l, ymd) && !out.has(l.picker_id)) out.set(l.picker_id, l);
    }
    return out;
}

/** ¿El fallo es por no tener red? (entonces la petición va a la cola) */
export function isNetworkFailure(error: unknown, online: boolean): boolean {
    if (!online) return true;
    const msg = error instanceof Error ? error.message : (error as { message?: string } | null)?.message ?? '';
    return /failed to fetch|network|load failed|fetch failed/i.test(msg);
}

/** Petición de ausencia pendiente de subir (cola sin red) */
export interface QueuedLeaveRequest {
    id: string;
    picker_id: string;
    type: LeaveType;
    start_date: string;
    end_date: string;
    half_day: boolean;
    reason: string | null;
    requested_by: string;
}

/** Días naturales de la ausencia (medio día = 0,5) */
export function leaveDays(leave: Pick<LeaveRequest, 'start_date' | 'end_date' | 'half_day'>): number {
    if (leave.half_day) return 0.5;
    const ms = Date.parse(`${leave.end_date}T00:00:00Z`) - Date.parse(`${leave.start_date}T00:00:00Z`);
    return Math.round(ms / 86400000) + 1;
}
