/**
 * Attendance Processor — elementos ATTENDANCE de la cola del móvil.
 *
 * Todo va por manage-attendance (hora del servidor, o la del móvil corregida
 * con su desfase y nunca del futuro; mismas reglas de alcance y de día /
 * semana cerrados). Un rechazo del servidor (4xx: día cerrado, otro equipo,
 * hora imposible) va a la cola de fallidos con su motivo, sin reintentos.
 *
 * Formatos:
 * - Pase de lista (`action`, rollCall.service): id del tramo y hora del móvil.
 * - Antiguo (sin `action`: check_in / check_out sueltos; lo puede volver a
 *   encolar conflictService «keep_local»): se convierte en la acción
 *   equivalente. Antes la salida se escribía directa en la tabla con la hora
 *   del móvil, sin pasar por el servidor.
 */

import { attendanceService } from '../attendance.service';
import type { AttendancePayload } from './types';
import { SyncRejectedError, isServerRejection } from '../sync-queue/rejectedError';

type RollCallPayload = AttendancePayload & { action: NonNullable<AttendancePayload['action']> };

async function processRollCall(payload: RollCallPayload): Promise<void> {
    const id = payload.attendance_id;
    if (!id) throw new SyncRejectedError('Roll call item without shift id');
    // Hora del móvil + lo que ya se corrigió (sin dato en elementos de una
    // versión anterior: el servidor no la vuelve a corregir); client_now lo
    // pone attendance.service al enviar
    const device = { at: payload.at, skewApplied: payload.clock_skew_ms, pickerId: payload.picker_id };
    try {
        if (payload.action === 'check_in') {
            await attendanceService.checkInPicker(payload.picker_id, payload.orchard_id, payload.verifiedBy, {
                ...device, clientId: id,
            });
        } else if (payload.action === 'check_out') {
            await attendanceService.checkOutPicker(id, device);
        } else {
            await attendanceService.recordBreak(payload.action, id, device);
        }
    } catch (e) {
        if (isServerRejection(e)) throw new SyncRejectedError((e as Error).message);
        throw e;
    }
}

/** Formato antiguo → acción del pase de lista */
export function legacyToRollCall(payload: AttendancePayload): RollCallPayload | null {
    if (payload.check_out && payload.attendanceId) {
        return { ...payload, action: 'check_out', attendance_id: payload.attendanceId, at: payload.check_out };
    }
    if (!payload.picker_id || !payload.orchard_id) return null;
    return {
        ...payload,
        action: 'check_in',
        attendance_id: payload.attendanceId ?? crypto.randomUUID(),
        ...(payload.check_in ? { at: payload.check_in } : {}),
    };
}

export async function processAttendance(payload: AttendancePayload, _expectedUpdatedAt?: string): Promise<void> {
    if (payload.action) {
        await processRollCall({ ...payload, action: payload.action });
        return;
    }
    const converted = legacyToRollCall(payload);
    if (!converted) throw new SyncRejectedError('Attendance item without person, orchard or shift');
    await processRollCall(converted);
}
