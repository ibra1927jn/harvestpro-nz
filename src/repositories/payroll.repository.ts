/**
 * Payroll Repository — Domain queries for payroll service
 * 
 * Extracts Supabase calls from payroll.service.ts:
 *  - Edge Function invocation (calculate-payroll) — via gateway resilience
 *  - Timesheet data fetching (daily_attendance + pickers)
 */
import { supabase } from '@/services/supabase';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';

export interface PayWeekActionResult {
    week: { start: string; end: string };
    closed?: boolean;
    reopened?: boolean;
    already_closed?: boolean;
    total_earnings?: number;
    /** No se puede cerrar con horas estimadas: quién y qué días */
    reason?: 'ESTIMATED_HOURS';
    pending?: { picker_id: string; picker_name: string; dates: string[] }[];
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
            .select('id, picker_id, date, check_in, check_out, break_start, break_minutes, verified_by, orchard_id, updated_at')
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .is('deleted_at', null)
            .order('check_in', { ascending: true });
        return { data: data || [], error };
    },

    /** Fetch picker names by IDs */
    async fetchPickerNames(pickerIds: string[]): Promise<Record<string, string>> {
        if (pickerIds.length === 0) return {};
        const { data } = await supabase
            .from('pickers')
            .select('id, name')
            .in('id', pickerIds);
        return Object.fromEntries((data || []).map(p => [p.id, p.name]));
    },
};

