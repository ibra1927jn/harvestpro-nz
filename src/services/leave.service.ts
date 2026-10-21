/**
 * Leave Service — ausencias y permisos (Agenda de RRHH).
 *
 * Crear, listar por rango o por persona, aprobar, rechazar y cancelar.
 * Escrituras directas (RRHH y manager trabajan con conexión); quién puede
 * hacer qué lo decide la RLS de leave_requests (migración 20261022041000).
 * Las filas se validan con Zod al entrar y al salir.
 */
import { leaveRepository } from '@/repositories/leave.repository';
import {
    LeaveRequestSchema,
    NewLeaveRequestSchema,
    safeParse,
    safeParseArray,
    type NewLeaveRequest,
    type ValidatedLeaveRequest,
} from '@/schemas/zod.schemas';

export type LeaveRequest = ValidatedLeaveRequest;
export type LeaveType = LeaveRequest['type'];
export type LeaveStatus = LeaveRequest['status'];

export interface NewLeaveInput {
    orchardId: string;
    pickerId: string;
    type: LeaveType;
    startDate: string;
    endDate: string;
    halfDay?: boolean;
    reason?: string | null;
    requestedBy: string | null;
    /** RRHH puede registrarla ya aprobada; el resto solo "requested" (RLS) */
    status?: LeaveStatus;
}

/* ── Lógica pura ─────────────────────────────── */

/** ¿La ausencia cubre esa fecha (YYYY-MM-DD)? */
export function leaveCoversDate(leave: Pick<LeaveRequest, 'start_date' | 'end_date'>, ymd: string): boolean {
    return leave.start_date <= ymd && ymd <= leave.end_date;
}

/** Personas con una ausencia aprobada que cubre la fecha dada (→ on_leave) */
export function onLeaveOn(leaves: ReadonlyArray<LeaveRequest>, ymd: string): Set<string> {
    const out = new Set<string>();
    for (const l of leaves) {
        if (l.status === 'approved' && leaveCoversDate(l, ymd)) out.add(l.picker_id);
    }
    return out;
}

/** Días naturales de la ausencia (medio día = 0,5) */
export function leaveDays(leave: Pick<LeaveRequest, 'start_date' | 'end_date' | 'half_day'>): number {
    if (leave.half_day) return 0.5;
    const ms = Date.parse(`${leave.end_date}T00:00:00Z`) - Date.parse(`${leave.start_date}T00:00:00Z`);
    return Math.round(ms / 86400000) + 1;
}

/* ── Servicio ────────────────────────────────── */

function parseOne(row: unknown): LeaveRequest {
    const r = safeParse(LeaveRequestSchema, row);
    if (!r.success) throw new Error(`Invalid leave request: ${r.error}`);
    return r.data;
}

async function decide(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    decidedBy: string | null,
    note?: string | null,
): Promise<LeaveRequest> {
    const row = await leaveRepository.setStatus(id, {
        status,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        decision_note: note?.trim() || null,
    });
    return parseOne(row);
}

export const leaveService = {
    /** Ausencias que tocan el rango [from, to] (empresa entera o un huerto) */
    async listInRange(from: string, to: string, orchardId?: string): Promise<LeaveRequest[]> {
        const rows = await leaveRepository.listInRange(from, to, orchardId);
        return safeParseArray(LeaveRequestSchema, rows);
    },

    /** Historial de una persona */
    async listByPerson(pickerId: string): Promise<LeaveRequest[]> {
        const rows = await leaveRepository.listByPerson(pickerId);
        return safeParseArray(LeaveRequestSchema, rows);
    },

    /** Nueva ausencia (solicitada, o aprobada si RRHH la registra así) */
    async create(input: NewLeaveInput): Promise<LeaveRequest> {
        const candidate: NewLeaveRequest = {
            orchard_id: input.orchardId,
            picker_id: input.pickerId,
            type: input.type,
            start_date: input.startDate,
            end_date: input.endDate,
            half_day: input.halfDay ?? false,
            reason: input.reason?.trim() || null,
            requested_by: input.requestedBy,
            status: input.status ?? 'requested',
        };
        const parsed = safeParse(NewLeaveRequestSchema, candidate);
        if (!parsed.success) throw new Error(parsed.error);
        const row = await leaveRepository.insert(parsed.data);
        return parseOne(row);
    },

    approve: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'approved', decidedBy, note),
    reject: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'rejected', decidedBy, note),
    cancel: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'cancelled', decidedBy, note),
};
