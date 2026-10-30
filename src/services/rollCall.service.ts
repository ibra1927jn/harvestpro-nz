/**
 * rollCall.service — Pase de lista del team leader con y sin cobertura
 * (auditoría 2026-10-23, D).
 *
 * Entrada, salida, inicio y fin de descanso:
 *   · con red se envían ya a manage-attendance;
 *   · sin red (o si la llamada falla por red) se guardan en la cola del móvil
 *     (ATTENDANCE, formato con `action`) con un id de tramo hecho en el móvil y
 *     la hora del móvil, y se envían solos y en orden al volver la cobertura;
 *   · si ya hay algo de esa persona esperando en la cola, lo nuevo va detrás
 *     (nunca adelanta a lo pendiente).
 * Con red la hora la pone el servidor (no se manda `at`). Sin red se guarda la
 * hora del móvil corregida con el desfase medido contra el servidor (clockSkew,
 * el mismo que usan las cubetas) cuando pasa de 2 minutos, y la corrección
 * aplicada (clock_skew_ms); al enviarla, el servidor la vuelve a corregir con
 * el desfase de ese momento (client_now), nunca la deja en el futuro y apunta
 * el desfase en el fichaje.
 */
import { attendanceService } from './attendance.service';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { logger } from '@/utils/logger';
import type { AttendancePayload } from './sync-processors/types';
import type { AttendanceRecord } from '@/types';

export type RollCallAction = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export interface QueuedRollCall {
    /** id del elemento en la cola */
    queueId: string;
    action: RollCallAction;
    picker_id: string;
    orchard_id: string;
    attendance_id: string;
    at: string;
}

export interface RollCallResult {
    state: 'saved' | 'queued';
    /** Tramo (el del servidor si se guardó, el del móvil si quedó en la cola) */
    attendanceId: string;
}

/** Desfase a partir del cual se corrige la hora y se avisa (como las cubetas) */
export const CLOCK_SKEW_WARN_MS = 2 * 60 * 1000;

/** Corrección que se aplica a la hora del móvil: el desfase medido si es grande */
export function appliedSkew(skewMs: number): number {
    return Math.abs(skewMs) > CLOCK_SKEW_WARN_MS ? skewMs : 0;
}

/** Hora «buena»: la del móvil más el desfase medido si es grande */
export function correctedNow(skewMs: number, nowMs = Date.now()): string {
    return new Date(nowMs + appliedSkew(skewMs)).toISOString();
}

/** ¿No se envió por falta de red? (entonces va a la cola) */
export function isOfflineFailure(error: unknown, online: boolean): boolean {
    if (!online) return true;
    const err = error as { name?: unknown; message?: unknown } | null;
    const name = typeof err?.name === 'string' ? err.name : '';
    if (name === 'GatewayError:network' || name === 'GatewayError:timeout' || name === 'TypeError') return true;
    const msg = typeof err?.message === 'string' ? err.message : '';
    return /failed to fetch|network|load failed|fetch failed|timed out/i.test(msg);
}

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

async function queuedItems(): Promise<QueuedRollCall[]> {
    const { syncService } = await import('./sync.service');
    const queue = await syncService.getQueue();
    const out: QueuedRollCall[] = [];
    for (const item of queue) {
        if (item.type !== 'ATTENDANCE') continue;
        const p = item.payload as AttendancePayload;
        if (!p.action || !p.attendance_id || !p.at) continue;
        out.push({ queueId: item.id, action: p.action, picker_id: p.picker_id, orchard_id: p.orchard_id, attendance_id: p.attendance_id, at: p.at });
    }
    return out;
}

async function enqueue(payload: AttendancePayload): Promise<void> {
    const { syncService } = await import('./sync.service');
    await syncService.addToQueue('ATTENDANCE', payload);
}

/** Con red: sin hora del móvil, la pone el servidor */
async function sendLive(action: RollCallAction, payload: Required<Pick<AttendancePayload, 'picker_id' | 'orchard_id' | 'attendance_id'>> & { verifiedBy?: string }): Promise<string> {
    const timing = { pickerId: payload.picker_id };
    if (action === 'check_in') {
        const res = await attendanceService.checkInPicker(payload.picker_id, payload.orchard_id, payload.verifiedBy, {
            clientId: payload.attendance_id,
        });
        return res.id;
    }
    if (action === 'check_out') return (await attendanceService.checkOutPicker(payload.attendance_id, timing)).id;
    return (await attendanceService.recordBreak(action, payload.attendance_id, timing)).id;
}

export const rollCallService = {
    /**
     * Registra una acción del pase de lista. `attendanceId`: el tramo (no hace
     * falta en check_in: se genera aquí).
     */
    async record(action: RollCallAction, params: {
        pickerId: string;
        orchardId: string;
        attendanceId?: string;
        recordedBy?: string;
    }): Promise<RollCallResult> {
        const attendanceId = action === 'check_in' ? crypto.randomUUID() : params.attendanceId;
        if (!attendanceId) throw new Error('No shift to update');
        // Hora del móvil (solo cuenta si va a la cola) y la corrección aplicada
        const skew = useHarvestStore.getState().clockSkew || 0;
        const nowMs = Date.now();
        const payload = {
            action,
            picker_id: params.pickerId,
            orchard_id: params.orchardId,
            attendance_id: attendanceId,
            at: correctedNow(skew, nowMs),
            clock_skew_ms: appliedSkew(skew),
            verifiedBy: params.recordedBy,
        };

        const online = isOnline();
        // Algo de esta persona sigue en la cola: esto va detrás, en orden
        const waiting = online && (await queuedItems()).some(q => q.picker_id === params.pickerId);
        if (online && !waiting) {
            try {
                return { state: 'saved', attendanceId: await sendLive(action, payload) };
            } catch (e) {
                if (!isOfflineFailure(e, isOnline())) throw e;
                logger.warn(`[RollCall] ${action} not sent (no signal): queued`);
            }
        }
        await enqueue(payload);
        return { state: 'queued', attendanceId };
    },

    /** Lo que sigue en la cola de este móvil (para pintarlo como «pendiente de enviar») */
    listQueued: queuedItems,
};

/** Un fichaje tal y como se ve en el pase de lista (con lo que sigue en la cola) */
export type RollCallRecord = AttendanceRecord & { pending?: boolean };

/**
 * Aplica lo que sigue en la cola sobre los fichajes del servidor, en orden: la
 * pantalla cambia al momento aunque no haya red, marcado «pendiente de enviar».
 */
export function applyQueuedRollCall(records: ReadonlyArray<AttendanceRecord>, queued: ReadonlyArray<QueuedRollCall>): RollCallRecord[] {
    const out: RollCallRecord[] = records.map(r => ({ ...r }));
    for (const q of queued) {
        if (q.action === 'check_in') {
            if (!out.some(r => r.id === q.attendance_id)) {
                out.push({ id: q.attendance_id, picker_id: q.picker_id, orchard_id: q.orchard_id, status: 'present', check_in: q.at, pending: true });
            }
            continue;
        }
        const rec = out.find(r => r.id === q.attendance_id)
            ?? out.filter(r => r.picker_id === q.picker_id && !r.check_out).pop();
        if (!rec) continue;
        rec.pending = true;
        if (q.action === 'check_out') rec.check_out = rec.check_out ?? q.at;
        else if (q.action === 'break_start') {
            rec.break_start = rec.break_start ?? q.at;
            rec.break_end = rec.break_end ?? null;
        } else rec.break_end = rec.break_end ?? q.at;
    }
    return out;
}
