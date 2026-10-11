/**
 * Payroll Repository — Domain queries for payroll service
 * 
 * Extracts Supabase calls from payroll.service.ts:
 *  - Edge Function invocation (calculate-payroll) — via gateway resilience
 *  - Timesheet data fetching (daily_attendance + pickers)
 */
import { supabase } from '@/services/supabase';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';

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

