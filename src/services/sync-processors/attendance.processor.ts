/**
 * Attendance Processor — Strategy Pattern processor for ATTENDANCE sync items.
 *
 * Handles check-in (append with dedup) and check-out (optimistic lock).
 * Check-out operations use withOptimisticLock to prevent silent overwrites
 * when a Manager corrects attendance while a Team Leader is offline.
 *
 * Conflict resolution policy para datos de nómina:
 * - Si el lock falla en check-out → KEEP_SERVER automático.
 *   Motivo: la versión del servidor es más reciente, lo que significa que un
 *   Manager/Admin ya corrigió el registro. La corrección del supervisor es
 *   autoritaria para el cálculo de nómina. El intento del TL se registra en
 *   sync_conflicts (IndexedDB) para auditoría.
 * - NO se reintenta → el ítem se elimina de la cola sin error.
 */

import { attendanceService } from '../attendance.service';
import { withOptimisticLock } from '../optimistic-lock.service';
import { conflictService } from '../conflict.service';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { logger } from '@/utils/logger';
import { shiftHours } from '@/services/harvestMetrics/pay';
import type { AttendancePayload } from './types';
import { SyncRejectedError, isServerRejection } from '../sync-queue/rejectedError';

/**
 * Pase de lista sin red (formato con `action`): se envía a manage-attendance con
 * el id del tramo y la hora del móvil. Reintentar no duplica (el servidor es
 * idempotente con ese id). Si el servidor lo rechaza (día o semana cerrados,
 * otro equipo, hora imposible) → cola de fallidos con el motivo, sin reintentos.
 */
async function processRollCall(payload: AttendancePayload & { action: NonNullable<AttendancePayload['action']> }): Promise<void> {
    const id = payload.attendance_id;
    if (!id) throw new SyncRejectedError('Roll call item without shift id');
    // Hora del móvil + lo que ya se corrigió; client_now lo pone attendance.service al enviar
    const device = { at: payload.at, skewApplied: payload.clock_skew_ms ?? 0, pickerId: payload.picker_id };
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

export async function processAttendance(
    payload: AttendancePayload,
    expectedUpdatedAt?: string
): Promise<void> {
    if (payload.action) {
        await processRollCall({ ...payload, action: payload.action });
        return;
    }
    if (payload.check_out && payload.attendanceId && expectedUpdatedAt) {
        // 🔧 L25: Calculate hours_worked for offline checkout
        // Without this, syncing offline checkouts left hours_worked as null → payroll = $0
        let hoursWorked: number | undefined;
        const existing = await attendanceRepository.getCheckInTime(payload.attendanceId);

        if (existing?.check_in && payload.check_out) {
            // Horas pagables con el cálculo único (descanso de 30 min no pagado; nunca negativas)
            hoursWorked = shiftHours({
                checkIn: existing.check_in,
                checkOut: payload.check_out,
                breakStart: existing.break_start,
                breakMinutes: existing.break_minutes,
            }).hours;
        }

        // Check-out with optimistic lock — prevents silent overwrite
        // if a Manager has corrected attendance while TL was offline
        const result = await withOptimisticLock({
            table: 'daily_attendance',
            recordId: payload.attendanceId,
            expectedUpdatedAt,
            updates: {
                check_out: payload.check_out,
                status: 'present',
                ...(hoursWorked !== undefined ? { hours_worked: hoursWorked } : {}),
            }
        });
        if (!result.success) {
            // Política server-wins: la corrección del supervisor es autoritaria para nómina.
            // Registramos el intento del TL en sync_conflicts para auditoría y
            // retornamos limpiamente — el ítem se elimina de la cola sin reintentos.
            logger.warn(
                `[AttendanceProcessor] Conflict on checkout ${payload.attendanceId}: ` +
                `server version is newer (expected=${expectedUpdatedAt}). ` +
                `Auto-resolving as keep_server (payroll policy).`
            );

            if (result.conflict) {
                await conflictService.resolve(result.conflict.id, 'keep_server');
            }

            // Retornar sin lanzar — el sync queue procesará el ítem como éxito
            return;
        }
    } else {
        // Check-in: delegate to existing service (already has dedup logic)
        await attendanceService.checkInPicker(
            payload.picker_id,
            payload.orchard_id,
            payload.verifiedBy
        );
    }
}
