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

/* ── Lógica pura (leaveLogic.ts) ─────────────── */
export {
    leaveCoversDate,
    onLeaveOn,
    leaveByPickerOn,
    isNetworkFailure,
    leaveDays,
    type QueuedLeaveRequest,
} from './leaveLogic';
import { isNetworkFailure, type QueuedLeaveRequest } from './leaveLogic';

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

    /** Lo que pidió esta persona (team leader) desde una fecha */
    async listRequestedBy(userId: string, sinceYmd: string): Promise<LeaveRequest[]> {
        const rows = await leaveRepository.listRequestedBy(userId, sinceYmd);
        return safeParseArray(LeaveRequestSchema, rows);
    },

    /**
     * El team leader pide una ausencia para alguien de su equipo (siempre
     * «requested»: la decide RRHH). Sin red va a la cola (LEAVE_REQUEST) y se sube
     * sola al volver la conexión; el id lo pone el móvil para no duplicarla.
     */
    async requestOfflineFirst(input: Omit<NewLeaveInput, 'status' | 'requestedBy'> & { requestedBy: string }): Promise<
        { state: 'saved'; leave: LeaveRequest } | { state: 'queued'; queued: QueuedLeaveRequest }
    > {
        const candidate: NewLeaveRequest = {
            id: crypto.randomUUID(),
            orchard_id: input.orchardId,
            picker_id: input.pickerId,
            type: input.type,
            start_date: input.startDate,
            end_date: input.halfDay ? input.startDate : input.endDate,
            half_day: input.halfDay ?? false,
            reason: input.reason?.trim() || null,
            requested_by: input.requestedBy,
            status: 'requested',
        };
        const parsed = safeParse(NewLeaveRequestSchema, candidate);
        if (!parsed.success) throw new Error(parsed.error);
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        try {
            if (!online) throw new Error('Offline');
            const row = await leaveRepository.insert(parsed.data);
            return { state: 'saved', leave: parseOne(row) };
        } catch (e) {
            if (!isNetworkFailure(e, online)) throw e;
            const queued: QueuedLeaveRequest = {
                id: parsed.data.id ?? candidate.id!,
                picker_id: parsed.data.picker_id,
                type: parsed.data.type,
                start_date: parsed.data.start_date,
                end_date: parsed.data.end_date,
                half_day: parsed.data.half_day,
                reason: parsed.data.reason,
                requested_by: input.requestedBy,
            };
            const { syncService } = await import('./sync.service');
            await syncService.addToQueue('LEAVE_REQUEST', { ...queued, orchard_id: parsed.data.orchard_id });
            return { state: 'queued', queued };
        }
    },

    /** Peticiones de ausencia que siguen en la cola de este móvil */
    async listQueued(): Promise<QueuedLeaveRequest[]> {
        const { syncService } = await import('./sync.service');
        const queue = await syncService.getQueue();
        return queue
            .filter(item => item.type === 'LEAVE_REQUEST')
            .map(item => item.payload as unknown as QueuedLeaveRequest);
    },

    approve: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'approved', decidedBy, note),
    reject: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'rejected', decidedBy, note),
    cancel: (id: string, decidedBy: string | null, note?: string | null) => decide(id, 'cancelled', decidedBy, note),
};
