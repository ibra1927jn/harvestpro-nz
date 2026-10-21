/**
 * my-timesheet.service — la hoja de horas de UNA persona (runner, team leader…)
 *
 * El runner solo ve sus propios tramos y no los corrige: nadie se corrige a sí
 * mismo (políticas «No self attendance …», 2026-10-13). Lo que puede hacer es
 * PEDIR una corrección, que llega al manager del huerto como mensaje directo y
 * él la aplica desde el editor de fichajes (con motivo y auditoría).
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { shiftHours, payWeekOf, type PayWeek } from '@/services/harvestMetrics/pay';
import { todayNZST, addDaysYMD } from '@/utils/nzst';
import { messagingRepository } from '@/repositories/messaging.repository';
import { logger } from '@/utils/logger';

export interface MyShift {
    id: string;
    date: string;
    orchardId: string | null;
    checkIn: string | null;
    checkOut: string | null;
    breakStart: string | null;
    breakMinutes: number | null;
    /** Horas pagables (descanso descontado); abiertos: hasta ahora */
    hours: number;
    status: 'open' | 'closed' | 'approved' | 'rejected';
    correctedAt: string | null;
    correctionReason: string | null;
}

interface AttendanceRow {
    id: string;
    date: string;
    orchard_id: string | null;
    check_in: string | null;
    check_out: string | null;
    break_start: string | null;
    break_minutes: number | null;
    verified_at: string | null;
    rejected_at: string | null;
    corrected_at: string | null;
    correction_reason: string | null;
}

function statusOf(row: AttendanceRow): MyShift['status'] {
    if (row.rejected_at) return 'rejected';
    if (row.verified_at) return 'approved';
    return row.check_out ? 'closed' : 'open';
}

/** Semana de pago (lunes–domingo NZ) desplazada `offset` semanas desde la actual */
export function payWeekAt(offsetWeeks: number, today = todayNZST()): PayWeek {
    return payWeekOf(addDaysYMD(today, offsetWeeks * 7));
}

export const myTimesheetService = {
    /** Tramos propios de un rango de fechas NZ (ambas incluidas), en orden */
    async fetchMyShifts(userId: string, startDate: string, endDate: string, now: Date = new Date()): Promise<MyShift[]> {
        const rows = await fetchAllRows<AttendanceRow>((from, to) => supabase
            .from('daily_attendance')
            .select('id, date, orchard_id, check_in, check_out, break_start, break_minutes, verified_at, rejected_at, corrected_at, correction_reason')
            .eq('picker_id', userId)
            .is('deleted_at', null)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date')
            .order('check_in', { nullsFirst: false })
            .order('id')
            .range(from, to));
        return rows.map(r => ({
            id: r.id,
            date: r.date,
            orchardId: r.orchard_id,
            checkIn: r.check_in,
            checkOut: r.check_out,
            breakStart: r.break_start,
            breakMinutes: r.break_minutes,
            hours: shiftHours({ checkIn: r.check_in, checkOut: r.check_out, breakStart: r.break_start, breakMinutes: r.break_minutes, now }).hours,
            status: statusOf(r),
            correctedAt: r.corrected_at,
            correctionReason: r.correction_reason,
        }));
    },

    /**
     * Pide al manager del huerto que corrija un tramo: mensaje directo (uno por
     * manager del huerto). Devuelve cuántos managers recibieron el aviso.
     */
    async requestCorrection(params: {
        userId: string;
        orchardId: string;
        content: string;
    }): Promise<number> {
        const { userId, orchardId, content } = params;
        const { data: managers, error } = await supabase
            .from('users')
            .select('id')
            .eq('orchard_id', orchardId)
            .eq('role', 'manager')
            .eq('is_active', true);
        if (error) throw error;
        const managerIds = (managers ?? []).map(m => m.id).filter(id => id !== userId);
        if (managerIds.length === 0) return 0;

        const conversations = await messagingRepository.getConversations(userId) as Array<{ id: string; type: string; participant_ids: string[] | null }>;
        let sent = 0;
        for (const managerId of managerIds) {
            let conversation = conversations.find(c => c.type === 'direct'
                && (c.participant_ids ?? []).length === 2
                && (c.participant_ids ?? []).includes(managerId));
            if (!conversation) {
                const created = await messagingRepository.createConversation('direct', [userId, managerId], userId) as { id: string; type: string; participant_ids: string[] | null } | null;
                if (!created) {
                    logger.warn('[MyTimesheet] Could not open a conversation with manager', managerId);
                    continue;
                }
                conversation = created;
            }
            await messagingRepository.sendMessage(conversation.id, userId, content);
            sent++;
        }
        return sent;
    },
};
