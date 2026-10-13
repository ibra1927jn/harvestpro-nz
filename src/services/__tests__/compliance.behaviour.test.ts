/**
 * Reglas NZ de compliance con limites exactos (salario minimo, descansos, horas).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import {
    getMinimumBucketsPerHour, checkWageCompliance, calculateEffectiveHourlyRate, checkWorkHoursCompliance,
    calculateNextBreakDue, getRequiredBreakDuration, isBreakOverdue, checkPickerCompliance,
} from '../compliance.service';

afterEach(() => { vi.useRealTimers(); });

describe('getMinimumBucketsPerHour', () => {
    it('exact divisions are not rounded up by floating point noise', () => {
        // 24.60 / 6 = 4.1 exacto (antes devolvia 4.2)
        expect(getMinimumBucketsPerHour(6, 24.6)).toBe(4.1);
        expect(getMinimumBucketsPerHour(5.5, 25.3)).toBe(4.6);
        expect(getMinimumBucketsPerHour(6.5, 26)).toBe(4);
    });

    it('rounds up to one decimal otherwise (23.95 / 6.50 = 3.68 -> 3.7)', () => {
        expect(getMinimumBucketsPerHour(6.5, 23.95)).toBe(3.7);
        expect(getMinimumBucketsPerHour(6.5)).toBe(3.7);
    });

    it('property: the result earns at least the minimum and 0.1 less does not', () => {
        fc.assert(fc.property(fc.integer({ min: 2000, max: 4000 }), fc.integer({ min: 300, max: 1500 }), (mwCents, rateCents) => {
            const mw = mwCents / 100, rate = rateCents / 100;
            const b = getMinimumBucketsPerHour(rate, mw);
            expect(b * rate).toBeGreaterThanOrEqual(mw - 1e-9);
            expect((b - 0.1) * rate).toBeLessThan(mw - 1e-9);
        }), { numRuns: 1000 });
    });
});

describe('checkWageCompliance', () => {
    it('exactly 23.95/h is compliant with no top-up', () => {
        const r = checkWageCompliance(1, 2, 47.9, 23.95); // 2 h, 47.90 de cubetas
        expect(r).toEqual({ isCompliant: true, effectiveHourlyRate: 23.95, minimumWage: 23.95, shortfall: 0, topUpRequired: 0 });
    });

    it('below the minimum: shortfall per hour and top-up for the day', () => {
        // 10 cubetas a 6.50 en 4 h = 65 -> 16.25/h; minimo 95.80 -> complemento 30.80
        const r = checkWageCompliance(10, 4, 6.5, 23.95);
        expect(r).toEqual({ isCompliant: false, effectiveHourlyRate: 16.25, minimumWage: 23.95, shortfall: 7.7, topUpRequired: 30.8 });
    });

    it('no hours: rate 0 and nothing owed', () => {
        expect(calculateEffectiveHourlyRate(10, 0, 6.5)).toBe(0);
        expect(checkWageCompliance(10, 0, 6.5, 23.95).topUpRequired).toBe(0);
    });
});

describe('checkWorkHoursCompliance', () => {
    it('needs a rest break from 110 consecutive minutes (10 min before the 2 h mark)', () => {
        expect(checkWorkHoursCompliance(109, 109).needsBreak).toBe(false);
        expect(checkWorkHoursCompliance(110, 110).needsBreak).toBe(true);
    });

    it('warns at 10 h consecutive and at 12 h in the day', () => {
        expect(checkWorkHoursCompliance(599, 599).warning).toBeUndefined();
        expect(checkWorkHoursCompliance(600, 600).warning).toBe('Worker has been working 10 hours without a mandatory break');
        expect(checkWorkHoursCompliance(60, 719)).toMatchObject({ maxRecommendedReached: false, warning: undefined });
        expect(checkWorkHoursCompliance(60, 720)).toMatchObject({
            maxRecommendedReached: true, warning: 'Worker has exceeded recommended 12 hours for the day',
        });
    });
});

describe('breaks', () => {
    const start = new Date('2026-10-12T07:00:00+13:00');

    it('next break is 2 h (rest), 4 h (meal) or 45 min (hydration) after the last one or the start', () => {
        expect(calculateNextBreakDue(null, 'rest', start).toISOString()).toBe('2026-10-11T20:00:00.000Z');
        expect(calculateNextBreakDue(null, 'meal', start).toISOString()).toBe('2026-10-11T22:00:00.000Z');
        expect(calculateNextBreakDue(null, 'hydration', start).toISOString()).toBe('2026-10-11T18:45:00.000Z');
        const last = new Date('2026-10-12T10:30:00+13:00');
        expect(calculateNextBreakDue(last, 'rest', start).toISOString()).toBe('2026-10-11T23:30:00.000Z');
    });

    it('break durations: 10 rest, 30 meal, 5 hydration', () => {
        expect([getRequiredBreakDuration('rest'), getRequiredBreakDuration('meal'), getRequiredBreakDuration('hydration')]).toEqual([10, 30, 5]);
    });

    it('overdue minutes are measured from the due time', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T09:25:30+13:00'));
        expect(isBreakOverdue(null, 'rest', start)).toMatchObject({ overdue: true, minutesOverdue: 25 });
        vi.setSystemTime(new Date('2026-10-12T09:00:00+13:00'));
        expect(isBreakOverdue(null, 'rest', start)).toMatchObject({ overdue: false, minutesOverdue: 0 });
    });
});

describe('checkPickerCompliance', () => {
    const base = {
        pickerId: 'p1', bucketCount: 40, hoursWorked: 3, consecutiveMinutesWorked: 30, totalMinutesToday: 180,
        lastRestBreakAt: null, lastMealBreakAt: null, lastHydrationAt: null,
    };

    it('uses the single pay calculation when given and flags below-minimum with shortfall', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T08:00:00+13:00'));
        const r = checkPickerCompliance({
            ...base, workStartTime: new Date('2026-10-12T07:30:00+13:00'),
            pay: { belowMinimum: true, pieceHourlyRate: 20.5, minWageApplied: 23.95, topUp: 10.35 },
        });
        expect(r.wageCompliance).toEqual({ isCompliant: false, effectiveHourlyRate: 20.5, minimumWage: 23.95, shortfall: 3.45 });
        expect(r.violations.map(v => v.type)).toEqual(['wage_below_minimum']);
        expect(r.violations[0].details).toEqual({ shortfall: 3.45, topUpRequired: 10.35 });
        expect(r.isCompliant).toBe(false);
        // El siguiente descanso es la hidratacion (07:30 + 45 min)
        expect(r.nextBreakDue).toMatchObject({ type: 'hydration', overdue: false });
    });

    it('less than one hour worked never raises a wage violation', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T07:40:00+13:00'));
        const r = checkPickerCompliance({ ...base, bucketCount: 0, hoursWorked: 0.5, workStartTime: new Date('2026-10-12T07:30:00+13:00') });
        expect(r.violations).toEqual([]);
        expect(r.isCompliant).toBe(true);
    });

    it('overdue rest (>30 min) is high severity; only hydration reminders keep the picker compliant', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T09:45:00+13:00'));
        const workStartTime = new Date('2026-10-12T07:00:00+13:00');
        const r = checkPickerCompliance({ ...base, bucketCount: 100, hoursWorked: 2.75, workStartTime });
        const rest = r.violations.find(v => v.type === 'break_overdue');
        expect(rest).toMatchObject({ severity: 'high', message: 'Rest break overdue by 45 minutes' });
        expect(r.violations.find(v => v.type === 'hydration_reminder')?.severity).toBe('low');

        const ok = checkPickerCompliance({
            ...base, bucketCount: 100, hoursWorked: 2.75, workStartTime,
            lastRestBreakAt: new Date('2026-10-12T09:00:00+13:00'), lastMealBreakAt: null,
        });
        expect(ok.violations.map(v => v.type)).toEqual(['hydration_reminder']);
        expect(ok.isCompliant).toBe(true);
    });
});
