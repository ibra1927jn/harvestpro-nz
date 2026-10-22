/**
 * my-timesheet.service — la hoja de horas de UNA persona (runner, team leader…)
 *
 * El runner solo ve sus propios tramos y no los corrige: nadie se corrige a sí
 * mismo (políticas «No self attendance …», 2026-10-13). Lo que puede hacer es
 * PEDIR una corrección, que llega como mensaje directo a los managers del huerto
 * y a su team leader (si tiene), que la aplican desde el editor de fichajes
 * (con motivo y auditoría). Necesita red: la vista avisa si no la hay.
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
     * Quién recibe la solicitud: los managers activos del huerto y el team leader
     * de la persona (pickers.team_leader_id, el id de su cuenta), sin repetir ni
     * incluirse a uno mismo.
     */
    async correctionRecipients(userId: string, orchardId: string): Promise<string[]> {
        const [{ data: managers, error }, { data: me, error: meError }] = await Promise.all([
            supabase.from('users').select('id').eq('orchard_id', orchardId).eq('role', 'manager').eq('is_active', true),
            supabase.from('pickers').select('team_leader_id').eq('id', userId).maybeSingle(),
        ]);
        if (error) throw error;
        if (meError) logger.warn('[MyTimesheet] Could not read own team leader', meError);
        const ids = (managers ?? []).map(m => m.id);
        if (me?.team_leader_id) ids.push(me.team_leader_id);
        return [...new Set(ids)].filter(id => id !== userId);
    },

    /**
     * Pide que corrijan un tramo: mensaje directo a cada destinatario (managers
     * del huerto y team leader). Devuelve cuántos recibieron el aviso.
     */
    async requestCorrection(params: {
        userId: string;
        orchardId: string;
        content: string;
    }): Promise<number> {
        const { userId, orchardId, content } = params;
        const recipientIds = await myTimesheetService.correctionRecipients(userId, orchardId);
        if (recipientIds.length === 0) return 0;

        const conversations = await messagingRepository.getConversations(userId) as Array<{ id: string; type: string; participant_ids: string[] | null }>;
        let sent = 0;
        for (const recipientId of recipientIds) {
            let conversation = conversations.find(c => c.type === 'direct'
                && (c.participant_ids ?? []).length === 2
                && (c.participant_ids ?? []).includes(recipientId));
            if (!conversation) {
                const created = await messagingRepository.createConversation('direct', [userId, recipientId], userId) as { id: string; type: string; participant_ids: string[] | null } | null;
                if (!created) {
                    logger.warn('[MyTimesheet] Could not open a conversation with', recipientId);
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
