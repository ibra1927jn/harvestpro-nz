/**
 * Attendance Repository — Domain queries for daily_attendance table
 *
 * Encapsulates all Supabase queries related to attendance so that
 * attendance.service.ts has ZERO direct supabase imports.
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { logger } from '@/utils/logger';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

export const attendanceRepository = {
    /** Get today's attendance with picker info (join) */
    async getDailyWithPickers(orchardId: string, date: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .select(`*, picker:pickers ( name, role, team_leader_id )`)
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .is('deleted_at', null);
        if (error) throw error;
        return data || [];
    },

    /** Get attendance by date with picker join (id, name, picker_id) */
    async getByDateWithPickers(orchardId: string, date: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .select(`*, picker:pickers ( id, name, picker_id )`)
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .order('check_in', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /** Find a single attendance record */
    async findOne(pickerId: string, orchardId: string, date: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('id')
            .eq('picker_id', pickerId)
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .is('deleted_at', null)
            .order('check_in', { ascending: false })
            .limit(1);
        // Varios tramos al día: el más reciente
        return data?.[0] ?? null;
    },

    /** Insert new attendance record */
    async insert(record: Record<string, unknown>) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .insert(record)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Update attendance record */
    async update(id: string, updates: Record<string, unknown>) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Fetch check_in for a single attendance record */
    async getCheckInTime(id: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('check_in, break_start, break_minutes')
            .eq('id', id)
            .single();
        return data;
    },

    /** Fetch check_in/out for a single record */
    async getCheckTimes(id: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('check_in, check_out')
            .eq('id', id)
            .single();
        return data;
    },

    /** Get active pickers with inner join on pickers table */
    async getActivePickers(orchardId: string, date: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .select(`picker_id, status, check_in, pickers!inner ( * )`)
            .eq('orchard_id', orchardId)
            .eq('date', date)
            // Trabajando ahora: tramo abierto (una persona puede tener varios tramos al día)
            .is('check_out', null)
            .is('deleted_at', null);
        if (error) throw error;
        return data || [];
    },

    /** Get hours summary for period (for payroll calculations) */
    async getHoursSummary(orchardId: string | undefined, sinceDate: string) {
        return fetchAllRows<{ picker_id: string; orchard_id: string | null; date: string; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null; corrected_at: string | null }>((from, to) => {
            let query = supabase
                .from('daily_attendance')
                .select('picker_id, orchard_id, date, check_in, check_out, break_start, break_minutes, corrected_at')
                .is('deleted_at', null)
                .gte('date', sinceDate);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('id').range(from, to);
        });
    },

    /**
     * Tramos sin hora de salida que hay que revisar: los de días pasados (horas
     * estimadas, la semana no se cierra hasta corregirlos) y los de hoy abiertos
     * desde hace más de PAY_RULES.maxUnreviewedShiftHours (salida olvidada: se
     * pagan como mucho esas horas; `long`). Últimos `days` días; opcionalmente
     * de un huerto o de ciertas personas. La RLS limita lo que ve cada rol.
     */
    async getUnclosedPastShifts(today: string, opts: { orchardId?: string; pickerIds?: string[]; days?: number; now?: Date } = {}) {
        const since = new Date(`${today}T12:00:00Z`);
        since.setUTCDate(since.getUTCDate() - (opts.days ?? 30));
        if (opts.pickerIds && opts.pickerIds.length === 0) return [];
        const longSince = new Date((opts.now ?? new Date()).getTime() - PAY_RULES.maxUnreviewedShiftHours * 3_600_000).toISOString();
        let q = supabase
            .from('daily_attendance')
            .select('id, picker_id, orchard_id, date, check_in, pickers(name), orchards(name)')
            .is('check_out', null)
            .is('deleted_at', null)
            .not('check_in', 'is', null)
            .or(`date.lt.${today},check_in.lt."${longSince}"`)
            .gte('date', since.toISOString().slice(0, 10))
            .order('date', { ascending: false });
        if (opts.orchardId) q = q.eq('orchard_id', opts.orchardId);
        if (opts.pickerIds) q = q.in('picker_id', opts.pickerIds);
        const { data, error } = await q;
        if (error) throw error;
        return ((data ?? []) as unknown as {
            id: string; picker_id: string; orchard_id: string | null; date: string; check_in: string | null;
            pickers: { name: string | null } | null; orchards: { name: string | null } | null;
        }[]).map(r => ({
            id: r.id,
            pickerId: r.picker_id,
            pickerName: r.pickers?.name ?? 'Unknown',
            orchardName: r.orchards?.name ?? '—',
            date: r.date,
            checkIn: r.check_in,
            /** De hoy, abierto desde hace más de 14 h */
            long: r.date >= today,
        }));
    },

    /** Get attendance for timesheet export (payroll.service) */
    async getTimesheets(orchardId: string, date: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .select('id, picker_id, date, check_in, check_out, verified_by, orchard_id, updated_at')
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .order('check_in', { ascending: true });
        if (error) {
            logger.error('[AttendanceRepo] Error fetching timesheets:', error);
            return [];
        }
        return data || [];
    },
    /** Update verified_by field on attendance record */
    async updateVerifiedBy(id: string, verifiedBy: string) {
        const { error } = await supabase
            .from('daily_attendance')
            .update({ verified_by: verifiedBy })
            .eq('id', id);
        if (error) throw error;
    },
};
