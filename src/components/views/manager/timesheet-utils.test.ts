/**
 * timesheet-utils — Pure Function Tests
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { formatTimeForInput, formatTime, calculateHours, isAbnormal, nzTimeToIso } from './timesheet-utils';

describe('timesheet-utils', () => {
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

        it('8 h shift pays 7.5 h', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z'), '2026-03-07')).toBe(7.5);
        });

        it('short shift (≤ 4 h) has no break deducted', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T10:30:00Z'), '2026-03-07')).toBe(3.5);
        });

        it('recorded break outside the shift falls back to the default rule', () => {
            expect(calculateHours(row('2026-03-07T07:00:00Z', '2026-03-07T15:00:00Z', { break_start: '2026-03-06T12:00:00Z' }), '2026-03-07')).toBe(7.5);
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
