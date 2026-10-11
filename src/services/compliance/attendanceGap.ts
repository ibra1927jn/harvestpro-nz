/**
 * attendanceGap — Detecta desajustes entre attendance y scans
 *
 * BUG-07: cubetas registradas sin check-in → no pagables legalmente en NZ
 * BUG-08: horas de asistencia sin actividad de cosecha → revisar con supervisor
 *
 * Umbrales NZ:
 *   - scansWithoutAttendance: hay scans pero no existe check_in (bloqueante)
 *   - attendanceWithoutScans: horas_worked > HOURS_WITHOUT_SCANS_THRESHOLD sin scans (sospechoso)
 */
import { nzMidnight, nzEndOfDay } from '@/utils/nzst';

import type { SupabaseClient } from '@supabase/supabase-js';

/** Umbral: horas registradas sin scans antes de alertar */
const HOURS_WITHOUT_SCANS_THRESHOLD = 2;

export interface AttendanceGapResult {
  pickerId: string;
  date: string;
  hasAttendance: boolean;
  scanCount: number;
  hoursWorked: number;
  /** true = cubetas registradas sin check-in — no pagable legalmente */
  scansWithoutAttendance: boolean;
  /** true = horas registradas sin actividad de cosecha */
  attendanceWithoutScans: boolean;
}

/**
 * Comprueba si hay desajuste entre attendance y scans para un picker en una fecha.
 *
 * @param supabase - Cliente Supabase autenticado
 * @param pickerId - UUID del picker
 * @param date     - Fecha en formato 'YYYY-MM-DD' (timezone NZ)
 * @returns        - Resultado con flags de compliance
 */
export async function checkAttendanceGap(
  supabase: SupabaseClient,
  pickerId: string,
  date: string
): Promise<AttendanceGapResult> {
  const [attendanceRes, scansRes] = await Promise.all([
    supabase
      .from('daily_attendance')
      .select('hours_worked, check_in')
      .eq('picker_id', pickerId)
      .eq('date', date)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('bucket_records')
      .select('id', { count: 'exact', head: true })
      .eq('picker_id', pickerId)
      .gte('scanned_at', nzMidnight(date))
      .lte('scanned_at', nzEndOfDay(date))
      .is('deleted_at', null),
  ]);

  const hasAttendance = !!attendanceRes.data?.check_in;
  const scanCount = scansRes.count ?? 0;
  const hoursWorked = attendanceRes.data?.hours_worked ?? 0;

  return {
    pickerId,
    date,
    hasAttendance,
    scanCount,
    hoursWorked,
    scansWithoutAttendance: scanCount > 0 && !hasAttendance,
    attendanceWithoutScans: hasAttendance && scanCount === 0 && hoursWorked > HOURS_WITHOUT_SCANS_THRESHOLD,
  };
}

/**
 * Descripcion legible del gap para mostrar en UI (en ingles como el codigo).
 * El llamador puede traducir usando i18n si lo necesita.
 */
export function formatAttendanceGapMessage(result: AttendanceGapResult): string | null {
  if (result.scansWithoutAttendance) {
    return `Picker ${result.pickerId}: buckets recorded without check-in on ${result.date} — not payable without attendance record. Fix timesheet before day close.`;
  }
  if (result.attendanceWithoutScans) {
    return `Picker ${result.pickerId}: ${result.hoursWorked}h attendance recorded with no harvest activity on ${result.date} — review with supervisor.`;
  }
  return null;
}
