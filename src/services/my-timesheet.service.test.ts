/**
 * my-timesheet.service — tramos propios y solicitud de corrección al manager.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseMock = vi.hoisted(() => {
    const state = { attendance: [] as unknown[], managers: [] as unknown[], me: null as unknown };
    const chain = (rows: () => unknown[]) => {
        const q: Record<string, unknown> = {};
        const self = () => q;
        for (const m of ['select', 'eq', 'is', 'gte', 'lte', 'order']) q[m] = self;
        q.range = (from: number, to: number) => Promise.resolve({ data: rows().slice(from, to + 1), error: null });
        q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
        q.then = (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: rows(), error: null });
        return q;
    };
    const rowsOf = (table: string): unknown[] => {
        if (table === 'daily_attendance') return state.attendance;
        if (table === 'pickers') return state.me ? [state.me] : [];
        return state.managers;
    };
    return {
        state,
        supabase: { from: (table: string) => chain(() => rowsOf(table)) },
    };
});

vi.mock('@/services/supabase', () => ({ supabase: supabaseMock.supabase }));

const messaging = vi.hoisted(() => ({
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
}));
vi.mock('@/repositories/messaging.repository', () => ({ messagingRepository: messaging }));

import { myTimesheetService, payWeekAt } from './my-timesheet.service';

describe('payWeekAt', () => {
    it('semana de pago lunes–domingo desplazada N semanas', () => {
        // 2026-10-14 es miércoles → semana 12–18; la anterior 5–11
        expect(payWeekAt(0, '2026-10-14')).toMatchObject({ start: '2026-10-12', end: '2026-10-18' });
        expect(payWeekAt(-1, '2026-10-14')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    });
});

describe('fetchMyShifts', () => {
    beforeEach(() => { supabaseMock.state.attendance = []; });

    it('mapea estado y horas de cada tramo propio', async () => {
        supabaseMock.state.attendance = [
            { id: 'a', date: '2026-10-12', orchard_id: 'o1', check_in: '2026-10-12T07:00:00+13:00', check_out: '2026-10-12T15:30:00+13:00', break_start: '2026-10-12T12:00:00+13:00', break_minutes: 30, verified_at: '2026-10-13T08:00:00Z', rejected_at: null, corrected_at: null, correction_reason: null },
            { id: 'b', date: '2026-10-13', orchard_id: 'o1', check_in: '2026-10-13T07:00:00+13:00', check_out: null, break_start: null, break_minutes: null, verified_at: null, rejected_at: null, corrected_at: null, correction_reason: null },
            { id: 'c', date: '2026-10-11', orchard_id: 'o1', check_in: '2026-10-11T07:00:00+13:00', check_out: '2026-10-11T12:00:00+13:00', break_start: null, break_minutes: 0, verified_at: null, rejected_at: '2026-10-12T08:00:00Z', corrected_at: '2026-10-12T07:00:00Z', correction_reason: 'salió antes' },
        ];
        const now = new Date('2026-10-13T09:00:00+13:00');
        const out = await myTimesheetService.fetchMyShifts('u1', '2026-10-12', '2026-10-18', now);
        expect(out.map(s => s.status)).toEqual(['approved', 'open', 'rejected']);
        expect(out[0].hours).toBeCloseTo(8, 2);        // 8.5 h − 30 min (descanso anotado)
        expect(out[1].hours).toBeCloseTo(2, 2);        // abierto: hasta ahora (07:00 → 09:00) sin descanso anotado
        expect(out[2]).toMatchObject({ correctedAt: '2026-10-12T07:00:00Z', correctionReason: 'salió antes' });
    });
});

describe('requestCorrection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        supabaseMock.state.managers = [{ id: 'm1' }, { id: 'm2' }];
        supabaseMock.state.me = null;
        messaging.getConversations.mockResolvedValue([
            { id: 'conv-m1', type: 'direct', participant_ids: ['u1', 'm1'] },
            { id: 'grp', type: 'group', participant_ids: ['u1', 'm2', 'x'] },
        ]);
        messaging.createConversation.mockResolvedValue({ id: 'conv-m2', type: 'direct', participant_ids: ['u1', 'm2'] });
        messaging.sendMessage.mockResolvedValue({});
    });

    it('un mensaje directo por manager del huerto; reutiliza la conversación directa si existe', async () => {
        const sent = await myTimesheetService.requestCorrection({ userId: 'u1', orchardId: 'o1', content: 'Corrección' });
        expect(sent).toBe(2);
        expect(messaging.createConversation).toHaveBeenCalledTimes(1);
        expect(messaging.createConversation).toHaveBeenCalledWith('direct', ['u1', 'm2'], 'u1');
        expect(messaging.sendMessage).toHaveBeenCalledWith('conv-m1', 'u1', 'Corrección');
        expect(messaging.sendMessage).toHaveBeenCalledWith('conv-m2', 'u1', 'Corrección');
    });

    it('también avisa al team leader de la persona (sin repetir ni incluirse a sí misma)', async () => {
        supabaseMock.state.me = { team_leader_id: 'tl1' };
        messaging.createConversation.mockImplementation((_t: string, ids: string[]) =>
            Promise.resolve({ id: `conv-${ids[1]}`, type: 'direct', participant_ids: ids }));
        const sent = await myTimesheetService.requestCorrection({ userId: 'u1', orchardId: 'o1', content: 'Corrección' });
        expect(sent).toBe(3);
        expect(messaging.sendMessage).toHaveBeenCalledWith('conv-tl1', 'u1', 'Corrección');

        // El team leader que pide su propia corrección no se avisa a sí mismo
        await expect(myTimesheetService.correctionRecipients('m1', 'o1')).resolves.toEqual(['m2', 'tl1']);
        supabaseMock.state.me = { team_leader_id: 'm2' };
        await expect(myTimesheetService.correctionRecipients('u1', 'o1')).resolves.toEqual(['m1', 'm2']);
    });

    it('sin managers ni team leader no envía nada y devuelve 0', async () => {
        supabaseMock.state.managers = [];
        const sent = await myTimesheetService.requestCorrection({ userId: 'u1', orchardId: 'o1', content: 'x' });
        expect(sent).toBe(0);
        expect(messaging.sendMessage).not.toHaveBeenCalled();
    });
});
