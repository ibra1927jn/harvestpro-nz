/**
 * timesheet-utils — Pure Function Tests
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    formatTimeForInput, formatTime, calculateHours, isAbnormal, nzTimeToIso,
    buildCorrectionUpdates, correctionFormFor, dailyTimesheetTotals, isMealBreakMissing,
    buildBatchItems, isFlagged,
} from './timesheet-utils';

describe('timesheet-utils', () => {
    describe('isMealBreakMissing (aviso al team leader: solo se descuenta lo anotado)', () => {
        const r = (check_in: string | null, check_out: string | null, extra: Record<string, unknown> = {}) =>
            ({ date: '2026-03-07', check_in, check_out, ...extra });
        it('closed shift over 4 h without a break: missing', () => {
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', '2026-03-07T11:30:00Z'), '2026-03-07')).toBe(true);
        });
        it('4 h or less: not needed', () => {
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', '2026-03-07T11:00:00Z'), '2026-03-07')).toBe(false);
        });
        it('break recorded inside the shift: not missing', () => {
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z', { break_start: '2026-03-07T11:00:00Z' }), '2026-03-07')).toBe(false);
        });
        it('open shift today counts until now', () => {
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', null), '2026-03-07', new Date('2026-03-07T10:00:00Z'))).toBe(false);
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', null), '2026-03-07', new Date('2026-03-07T12:00:00Z'))).toBe(true);
        });
        it('open shift of a past day is flagged as not closed instead', () => {
            expect(isMealBreakMissing(r('2026-03-07T07:00:00Z', null), '2026-03-08')).toBe(false);
        });
    });

    describe('formatTimeForInput', () => {
        it('formats ISO string to HH:MM pattern', () => {
            const result = formatTimeForInput('2026-03-07T09:30:00Z');
            expect(result).toMatch(/^\d{2}:\d{2}$/);
        });

        it('handles midnight correctly', () => {
            const result = formatTimeForInput('2026-03-07T00:00:00Z');
            expect(result).toMatch(/^\d{2}:\d{2}$/);
        });
    });

    describe('formatTime', () => {
        it('returns dash for null', () => {
            expect(formatTime(null)).toBe('—');
        });

        it('formats valid ISO string to a non-dash value', () => {
            const result = formatTime('2026-03-07T14:30:00Z');
            expect(result).toBeTruthy();
            expect(result).not.toBe('—');
        });
    });

    describe('calculateHours (cálculo único: descanso de 30 min no pagado)', () => {
        const row = (check_in: string | null, check_out: string | null, extra: Record<string, unknown> = {}) =>
            ({ date: '2026-03-07', check_in, check_out, ...extra });

        it('returns null when no check-in', () => {
            expect(calculateHours(row(null, null), '2026-03-07')).toBeNull();
        });

        it('8 h shift with the break recorded pays 7.5 h', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z', { break_start: '2026-03-07T11:00:00Z' }), '2026-03-07')).toBe(7.5);
        });

        it('8 h shift without a recorded break pays 8 h (nothing deducted)', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z'), '2026-03-07')).toBe(8);
        });

        it('short shift (≤ 4 h) has no break deducted', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T10:30:00Z'), '2026-03-07')).toBe(3.5);
        });

        it('recorded break outside the shift is not deducted', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z', { break_start: '2026-03-06T12:00:00Z' }), '2026-03-07')).toBe(8);
        });

        it('open shift today counts until now', () => {
            const now = new Date('2026-03-07T09:00:00Z');
            expect(calculateHours(row('2026-03-07T07:00:00Z', null), '2026-03-07', now)).toBe(2);
        });

        it('open shift on a past day is not counted (must be closed)', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', null), '2026-03-08')).toBeNull();
        });
    });

    describe('nzTimeToIso (hora NZ del día → UTC)', () => {
        it('summer (NZDT, +13)', () => {
            expect(nzTimeToIso('2026-10-12', '07:30')).toBe('2026-10-11T18:30:00.000Z');
        });

        it('winter (NZST, +12) — before it always used +13 and was an hour off', () => {
            expect(nzTimeToIso('2026-06-15', '07:30')).toBe('2026-06-14T19:30:00.000Z');
        });
    });

    describe('formatTime in NZ time regardless of browser zone', () => {
        it('shows NZ hour', () => {
            expect(formatTime('2026-10-11T18:30:00.000Z')).toBe('07:30');
            expect(formatTimeForInput('2026-06-14T19:30:00.000Z')).toBe('07:30');
        });
    });

    describe('isAbnormal', () => {
        it('returns false for null', () => {
            expect(isAbnormal(null)).toBe(false);
        });

        it('returns false for normal hours', () => {
            expect(isAbnormal(8)).toBe(false);
            expect(isAbnormal(12)).toBe(false);
        });

        it('returns true for > 12 hours', () => {
            expect(isAbnormal(13)).toBe(true);
        });

        it('returns true for negative hours', () => {
            expect(isAbnormal(-1)).toBe(true);
        });
    });
});

// ── Corrección y totales (extraídos de TimesheetEditor) ──

describe('correction form', () => {
    // 2026-10-13 es horario de verano NZ (+13:00); 2026-06-01 invierno (+12:00)
    it('prefills NZ HH:MM from the stored instants', () => {
        expect(correctionFormFor({ check_in: '2026-10-12T19:30:00Z', check_out: null, break_start: '2026-10-12T23:00:00Z' }))
            .toEqual({ checkIn: '08:30', checkOut: '', breakStart: '12:00', reason: '' });
    });

    it('converts NZ times of that day to UTC with the right offset', () => {
        const u = buildCorrectionUpdates({ date: '2026-06-01', break_start: null }, { checkIn: '07:00', checkOut: '15:30', breakStart: '' });
        expect(u).toEqual({ check_in: '2026-05-31T19:00:00.000Z', check_out: '2026-06-01T03:30:00.000Z' });
    });

    it('sends the break only when it changed, and null to clear it', () => {
        const rec = { date: '2026-10-13', break_start: '2026-10-12T23:00:00Z' };
        expect(buildCorrectionUpdates(rec, { checkIn: '', checkOut: '', breakStart: '12:00' })).toEqual({});
        expect(buildCorrectionUpdates(rec, { checkIn: '', checkOut: '', breakStart: '' })).toEqual({ break_start: null });
        expect(buildCorrectionUpdates(rec, { checkIn: '', checkOut: '', breakStart: '12:30' })).toEqual({ break_start: '2026-10-12T23:30:00.000Z' });
    });
});

describe('batch correction (#9)', () => {
    it('isFlagged: no check-out or meal break missing on a > 4 h shift', () => {
        const today = '2026-10-13';
        const now = new Date('2026-10-13T06:00:00Z'); // 19:00 NZ
        // Sin salida hoy: con aviso
        expect(isFlagged({ check_in: '2026-10-12T18:00:00Z', check_out: null, date: today, break_start: null }, today, now)).toBe(true);
        // 8 h sin descanso anotado: con aviso
        expect(isFlagged({ check_in: '2026-10-12T18:00:00Z', check_out: '2026-10-13T02:00:00Z', date: today, break_start: null }, today, now)).toBe(true);
        // 8 h con descanso anotado: sin aviso
        expect(isFlagged({ check_in: '2026-10-12T18:00:00Z', check_out: '2026-10-13T02:00:00Z', date: today, break_start: '2026-10-12T23:00:00Z' }, today, now)).toBe(false);
        // Turno corto cerrado: sin aviso
        expect(isFlagged({ check_in: '2026-10-12T18:00:00Z', check_out: '2026-10-12T21:00:00Z', date: today, break_start: null }, today, now)).toBe(false);
    });

    it('buildBatchItems: the same NZ time becomes the UTC instant of each timesheet\'s own day; empty fields are left out', () => {
        const items = buildBatchItems(
            [{ id: 'a', date: '2026-10-13' }, { id: 'b', date: '2026-06-01' }],
            { checkIn: '', checkOut: '16:30', breakStart: '12:00' },
        );
        expect(items).toEqual([
            { attendance_id: 'a', check_out: '2026-10-13T03:30:00.000Z', break_start: '2026-10-12T23:00:00.000Z' }, // +13
            { attendance_id: 'b', check_out: '2026-06-01T04:30:00.000Z', break_start: '2026-06-01T00:00:00.000Z' }, // +12
        ]);
        expect(buildBatchItems([{ id: 'a', date: '2026-10-13' }], { checkIn: '', checkOut: '', breakStart: '' }))
            .toEqual([{ attendance_id: 'a' }]);
    });
});

describe('dailyTimesheetTotals', () => {
    it('sums every column and counts people below minimum', () => {
        const row = (h: number, b: number, r: number, p: number, t: number, below: boolean) => ({
            hours_worked: h, buckets_total: b, buckets_rejected: r, piece_earnings: p, top_up: t, total_earnings: p + t, is_below_minimum: below,
        });
        expect(dailyTimesheetTotals([row(8, 40, 1, 260, 0, false), row(7.5, 10, 0, 65, 114.63, true)])).toEqual({
            hours: 15.5, buckets: 50, rejected: 1, piece: 325, topUp: 114.63, total: 439.63, belowMinimum: 1,
        });
        expect(dailyTimesheetTotals([]).total).toBe(0);
    });
});

describe('reviewStatusOf', () => {
    it('rejected wins over approved; nothing = pending', async () => {
        const { reviewStatusOf } = await import('./timesheet-utils');
        expect(reviewStatusOf({ verified_by: 'u', verified_at: 'x', rejected_at: null })).toBe('approved');
        expect(reviewStatusOf({ verified_by: null, verified_at: null, rejected_at: 'x' })).toBe('rejected');
        expect(reviewStatusOf({ verified_by: 'u', rejected_at: 'x' })).toBe('rejected');
        expect(reviewStatusOf({})).toBe('pending');
    });
});
