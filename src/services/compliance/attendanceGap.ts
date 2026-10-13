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
import { payForRange } from '@/services/harvestMetrics/pay';

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
      .select('orchard_id, check_in, check_out, break_start, break_minutes')
      .eq('picker_id', pickerId)
      .eq('date', date)
      .is('deleted_at', null),
    supabase
      .from('bucket_records')
      .select('id', { count: 'exact', head: true })
      .eq('picker_id', pickerId)
      .gte('scanned_at', nzMidnight(date))
      .lte('scanned_at', nzEndOfDay(date))
      .is('deleted_at', null),
  ]);

  // Varios tramos al día: horas con el cálculo único (un descanso, trayecto entre huertos)
  type Row = { orchard_id: string | null; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null };
  const rows = ((attendanceRes.data ?? []) as Row[]).filter(r => !!r.check_in);
  const hasAttendance = rows.length > 0;
  const scanCount = scansRes.count ?? 0;
  const [day] = payForRange({
    attendance: rows.map(r => ({ pickerId, date, orchardId: r.orchard_id, checkIn: r.check_in, checkOut: r.check_out, breakStart: r.break_start, breakMinutes: r.break_minutes })),
    buckets: [],
    pieceRate: 0,
    minWage: 0,
  });
  const hoursWorked = day?.hours ?? 0;

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
