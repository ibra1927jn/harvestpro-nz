import { logger } from '@/utils/logger';
import { todayNZST } from '@/utils/nzst';
import type { SupabasePicker, SupabasePerformanceStat } from '../types/database.types';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { pickerRepository } from '@/repositories/picker.repository';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { analytics } from '@/config/analytics';
import type { CorrectBatchResponse } from '@/schemas/api.schemas';
import { updateClockSkew } from './bucket-upload.service';

/** Pase de lista sin red: id del tramo hecho en el móvil y hora del móvil */
export interface RollCallTiming {
  /** check_in: id del tramo generado en el móvil (reintentar no duplica) */
  clientId?: string;
  /** Hora del móvil (ya corregida con el desfase medido) */
  at?: string;
  /** check_out / descanso: si el tramo del móvil no existe, el abierto de esta persona */
  pickerId?: string;
}

export type BreakAction = 'break_start' | 'break_end';

/** Llama a manage-attendance midiendo el desfase del reloj del móvil */
async function invokeAttendance(body: Record<string, unknown>): Promise<unknown> {
  const sentAt = Date.now();
  const { data, error } = await edgeFunctionsRepository.invoke('manage-attendance', body);
  if (error) throw error instanceof Error ? error : new Error(error.message);
  const serverTime = (data as { server_time?: unknown } | null)?.server_time;
  updateClockSkew(typeof serverTime === 'string' ? serverTime : undefined, sentAt, Date.now());
  return data;
}

/** Una corrección dentro de un lote: campos opcionales (sin valor = no tocar) */
export interface AttendanceCorrectionItem {
  attendance_id: string;
  check_in?: string;
  check_out?: string;
  /** null = quitar el descanso anotado */
  break_start?: string | null;
}

/** Máximo de fichajes por lote (el mismo que la Edge Function) */
export const ATTENDANCE_BATCH_MAX = 200;

export const attendanceService = {
  // --- DAILY ATTENDANCE (LIVE OPERATIONS) ---

  async getDailyAttendance(orchardId: string, date?: string) {
    const queryDate = date || todayNZST();
    return attendanceRepository.getDailyWithPickers(orchardId, queryDate);
  },

  /**
   * Check in a picker — via Edge Function (server-side)
   */
  async checkInPicker(pickerId: string, orchardId: string, verifiedBy?: string, timing: RollCallTiming = {}) {
    try {
      const data = await invokeAttendance({
        action: 'check_in',
        picker_id: pickerId,
        orchard_id: orchardId,
        verified_by: verifiedBy,
        ...(timing.clientId ? { client_id: timing.clientId } : {}),
        ...(timing.at ? { at: timing.at } : {}),
      });
      // Esquemas (zod) bajo demanda: no van en el bundle inicial
      const { CheckInResponseSchema, validateResponse } = await import('@/schemas/api.schemas');
      const result = validateResponse(CheckInResponseSchema, data, 'checkInPicker');
      // 📊 PostHog: Track picker check-in event
      analytics.trackCheckIn(pickerId);
      return result;
    } catch (err) {
      logger.error('[Attendance] Check-in via Edge Function failed:', err);
      throw err;
    }
  },

  /**
   * Check out a picker — via Edge Function (server-side)
   */
  async checkOutPicker(attendanceId: string, timing: RollCallTiming = {}) {
    try {
      const data = await invokeAttendance({
        action: 'check_out',
        attendance_id: attendanceId,
        ...(timing.at ? { at: timing.at } : {}),
        ...(timing.pickerId ? { picker_id: timing.pickerId } : {}),
      });
      const { CheckOutResponseSchema, validateResponse } = await import('@/schemas/api.schemas');
      return validateResponse(CheckOutResponseSchema, data, 'checkOutPicker');
    } catch (err) {
      logger.error('[Attendance] Check-out via Edge Function failed:', err);
      throw err;
    }
  },

  /** Inicio o fin del descanso de comida desde el pase de lista */
  async recordBreak(action: BreakAction, attendanceId: string, timing: RollCallTiming = {}) {
    try {
      const data = await invokeAttendance({
        action,
        attendance_id: attendanceId,
        ...(timing.at ? { at: timing.at } : {}),
        ...(timing.pickerId ? { picker_id: timing.pickerId } : {}),
      });
      const { BreakResponseSchema, validateResponse } = await import('@/schemas/api.schemas');
      return validateResponse(BreakResponseSchema, data, 'recordBreak');
    } catch (err) {
      logger.error(`[Attendance] ${action} via Edge Function failed:`, err);
      throw err;
    }
  },

  async getTodayPerformance(orchardId?: string) {
    return pickerRepository.getPerformanceToday(orchardId);
  },

  // 4. Get Active Pickers for Live Ops (Runner View)
  async getActivePickersForLiveOps(orchardId: string) {
    const today = todayNZST();

    const attendanceData = await attendanceRepository.getActivePickers(orchardId, today);
    const perfData = await pickerRepository.getPerformanceToday(orchardId);

    return (attendanceData || []).map((record: unknown) => {
      const rec = record as Record<string, unknown>;
      const p = rec.pickers as SupabasePicker;
      const perf = perfData?.find((stat: SupabasePerformanceStat) => stat.picker_id === p.id);

      const checkInTime = rec.check_in as string | null;
      let hoursWorked = 0;
      if (checkInTime) {
        hoursWorked =
          Math.round(((Date.now() - new Date(checkInTime).getTime()) / 3600000) * 100) / 100;
        hoursWorked = Math.max(0, hoursWorked);
      }

      return {
        id: p.id,
        picker_id: p.picker_id || p.id,
        name: p.name || 'Unknown',
        avatar: (p.name || '??').substring(0, 2).toUpperCase(),
        hours: hoursWorked,
        total_buckets_today: perf?.total_buckets || 0,
        current_row: p.current_row || 0,
        status: (p.status !== 'archived' && p.status !== 'inactive' ? 'active' : 'inactive') as
          | 'active'
          | 'break'
          | 'issue',
        safety_verified: p.safety_verified,
        qcStatus: [1, 1, 1],
        harness_id: p.harness_number || undefined,
        team_leader_id: p.team_leader_id || undefined,
        orchard_id: p.orchard_id,
        role: 'picker',
      };
    });
  },

  // ========================================
  // ADMIN: TIMESHEET CORRECTIONS
  // ========================================

  async getAttendanceByDate(orchardId: string, date: string) {
    return attendanceRepository.getByDateWithPickers(orchardId, date);
  },

  /**
   * Correct attendance — via Edge Function (server-side)
   * Includes audit trail and hours recalculation
   */
  async correctAttendance(
    attendanceId: string,
    updates: { check_in?: string; check_out?: string; break_start?: string | null },
    reason: string,
    adminId: string
  ): Promise<void> {
    try {
      const { error } = await edgeFunctionsRepository.invoke('manage-attendance', {
        action: 'correct',
        attendance_id: attendanceId,
        check_in: updates.check_in,
        check_out: updates.check_out,
        ...(updates.break_start !== undefined ? { break_start: updates.break_start } : {}),
        reason,
        admin_id: adminId,
      });

      if (error) throw new Error(error.message);
    } catch (err) {
      logger.error('[Attendance] Correction via Edge Function failed:', err);
      throw err;
    }
  },

  /**
   * Corrige varios fichajes de una vez (misma corrección y motivo para todos)
   * — Edge Function `correct_batch`. Devuelve el resultado por fichaje: una
   * fila que falla (p. ej. RLS) no tira el lote. Requiere conexión: la
   * corrección no se encola en Dexie (tampoco la simple).
   */
  async correctAttendanceBatch(
    items: AttendanceCorrectionItem[],
    reason: string,
    adminId: string
  ): Promise<CorrectBatchResponse> {
    if (items.length === 0) {
      return { success: true, total: 0, succeeded: 0, failed: 0, results: [] };
    }
    if (items.length > ATTENDANCE_BATCH_MAX) {
      throw new Error(`At most ${ATTENDANCE_BATCH_MAX} timesheets per batch`);
    }
    try {
      const { data, error } = await edgeFunctionsRepository.invoke('manage-attendance', {
        action: 'correct_batch',
        // Solo los campos con valor: la Edge Function no toca lo que no viene
        items: items.map(item => ({
          attendance_id: item.attendance_id,
          ...(item.check_in ? { check_in: item.check_in } : {}),
          ...(item.check_out ? { check_out: item.check_out } : {}),
          ...(item.break_start !== undefined ? { break_start: item.break_start } : {}),
        })),
        reason,
        admin_id: adminId,
      });

      if (error) throw new Error(error.message);
      const { CorrectBatchResponseSchema, validateResponse } = await import('@/schemas/api.schemas');
      return validateResponse(CorrectBatchResponseSchema, data, 'correctAttendanceBatch');
    } catch (err) {
      logger.error('[Attendance] Batch correction via Edge Function failed:', err);
      throw err;
    }
  },
};

