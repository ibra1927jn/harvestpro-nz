/**
 * Payroll Repository — Domain queries for payroll service
 * 
 * Extracts Supabase calls from payroll.service.ts:
 *  - Edge Function invocation (calculate-payroll) — via gateway resilience
 *  - Timesheet data fetching (daily_attendance + pickers)
 */
import { supabase } from '@/services/supabase';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { fetchInChunks } from '@/utils/fetchInChunks';

export interface PayWeekActionResult {
    week: { start: string; end: string };
    closed?: boolean;
    reopened?: boolean;
    already_closed?: boolean;
    total_earnings?: number;
    /**
     * No se puede cerrar: horas estimadas (tramos sin salida) o tramos sin
     * aprobar / rechazados / de más de 14 h sin corregir. Quién y qué días.
     */
    reason?: 'ESTIMATED_HOURS' | 'UNREVIEWED_HOURS';
    pending?: {
        picker_id: string;
        picker_name: string;
        dates: string[];
        /** Solo con UNREVIEWED_HOURS: el problema de cada día */
        issues?: { date: string; issue: 'not_approved' | 'rejected' | 'needs_correction' }[];
    }[];
}

export const payrollRepository = {
    /** Invoke the calculate-payroll Edge Function with gateway resilience */
    /** orchardId vacío = nómina de la empresa (todos los huertos, suma por persona) */
    async invokeCalculatePayroll(orchardId: string | undefined, startDate: string, endDate: string) {
        const { data, error } = await edgeFunctionsRepository.invoke('calculate-payroll', {
            ...(orchardId ? { orchard_id: orchardId } : {}),
            start_date: startDate,
            end_date: endDate,
        });
        if (error) throw new Error(error.message);
        return data;
    },

    /**
     * Cerrar / reabrir / consultar una semana de pago (Edge Function close-pay-week).
     * Sin reintentos automáticos: cerrar o reabrir es una acción del usuario.
     */
    async invokePayWeek(body: { action: 'close' | 'reopen' | 'status'; week_start: string; reason?: string }) {
        const { data, error } = await supabase.functions.invoke('close-pay-week', { body });
        if (error) {
            // El motivo real viene en el cuerpo de la respuesta (hint)
            let hint = error.message;
            try {
                const ctx = (error as { context?: Response }).context;
                const json = ctx ? await ctx.json() : null;
                hint = json?.hint || json?.error || hint;
            } catch { /* respuesta sin JSON */ }
            throw new Error(hint);
        }
        return data as PayWeekActionResult;
    },

    /** Fetch attendance records for timesheets (hours calculated from check_in/check_out) */
    async fetchTimesheetAttendance(orchardId: string, date: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            // CRIT-1 FIX: hours_worked column does NOT exist in daily_attendance.
            // Hours are calculated as diff(check_out - check_in) in the service layer.
            .select('id, picker_id, date, check_in, check_out, break_start, break_minutes, verified_by, rejected_at, rejection_reason, orchard_id, updated_at, corrected_at')
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .is('deleted_at', null)
            .order('check_in', { ascending: true });
        return { data: data || [], error };
    },

    /**
     * Todo lo de un día de estas personas en CUALQUIER huerto (tramos y
     * cubetas): las horas y el complemento se calculan con el día entero.
     */
    async fetchDayOfPeople(pickerIds: string[], date: string, dayStartIso: string, dayEndIso: string) {
        if (pickerIds.length === 0) return { shifts: [], buckets: [] };
        // Por trozos de ids y paginado: un día de 85 personas son ~3.400 cubetas
        // y PostgREST corta en 1000 (la hoja del día salía con un tercio de las
        // cubetas); con 200+ personas la URL daba 414 (prueba de carga 2026-10-21)
        const [shifts, buckets] = await Promise.all([
            fetchInChunks(pickerIds, (ids, from, to) =>
                supabase
                    .from('daily_attendance')
                    .select('id, picker_id, orchard_id, check_in, check_out, break_start, break_minutes, corrected_at')
                    .in('picker_id', ids)
                    .eq('date', date)
                    .is('deleted_at', null)
                    .order('id')
                    .range(from, to),
            ).catch(() => []),
            fetchInChunks(pickerIds, (ids, from, to) =>
                supabase
                    .from('bucket_records')
                    .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
                    .in('picker_id', ids)
                    .is('deleted_at', null)
                    .gte('scanned_at', dayStartIso)
                    .lte('scanned_at', dayEndIso)
                    .order('id')
                    .range(from, to),
            ).catch(() => []),
        ]);
        return {
            shifts: (shifts || []) as { id: string; picker_id: string; orchard_id: string | null; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null; corrected_at: string | null }[],
            buckets: (buckets || []) as { picker_id: string; orchard_id: string | null; variety: string | null; scanned_at: string; quality_grade: string | null }[],
        };
    },

    /** Fetch picker names by IDs */
    async fetchPickerNames(pickerIds: string[]): Promise<Record<string, string>> {
        if (pickerIds.length === 0) return {};
        const data = await fetchInChunks(pickerIds, (ids, from, to) =>
            supabase.from('pickers').select('id, name').in('id', ids).order('id').range(from, to),
        ).catch(() => [] as { id: string; name: string }[]);
        return Object.fromEntries(data.map(p => [p.id, p.name]));
    },
};

