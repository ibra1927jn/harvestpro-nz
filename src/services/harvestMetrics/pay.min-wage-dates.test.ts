/**
 * Salario mínimo por fecha (auditoría 2026-10-16, hallazgo 8): cada día se
 * paga con el mínimo legal que regía ese día, también en la semana en que
 * cambia (siempre el 1 de abril, que puede caer a mitad de semana).
 */
import { describe, it, expect } from 'vitest';
import { dayPay, minWageFloorOn, NZ_MIN_WAGE_HISTORY, PAY_RULES } from './pay';

describe('minWageFloorOn', () => {
    it('uses the rate in force on each day', () => {
        expect(minWageFloorOn('2024-06-01')).toBe(23.15);
        expect(minWageFloorOn('2025-04-01')).toBe(23.5);
        expect(minWageFloorOn('2026-03-31')).toBe(23.5);
        expect(minWageFloorOn('2026-04-01')).toBe(23.95);
    });

    it('accepts full timestamps and uses only the date part', () => {
        expect(minWageFloorOn('2026-04-01T06:30:00+13:00')).toBe(23.95);
    });

    it('without a date, or after the last change, uses the latest rate', () => {
        expect(minWageFloorOn()).toBe(23.95);
        expect(minWageFloorOn('2026-10-16')).toBe(23.95);
        expect(PAY_RULES.minWageFloor).toBe(NZ_MIN_WAGE_HISTORY[NZ_MIN_WAGE_HISTORY.length - 1].rate);
    });

    it('before the first entry, uses the oldest rate', () => {
        expect(minWageFloorOn('2020-01-01')).toBe(NZ_MIN_WAGE_HISTORY[0].rate);
    });

    it('history is ordered and every change starts on 1 April', () => {
        for (let i = 1; i < NZ_MIN_WAGE_HISTORY.length; i++) {
            expect(NZ_MIN_WAGE_HISTORY[i].from > NZ_MIN_WAGE_HISTORY[i - 1].from).toBe(true);
            expect(NZ_MIN_WAGE_HISTORY[i].rate).toBeGreaterThan(NZ_MIN_WAGE_HISTORY[i - 1].rate);
        }
        for (const row of NZ_MIN_WAGE_HISTORY) expect(row.from.slice(5)).toBe('04-01');
    });
});

describe('dayPay applies the minimum wage of the day being paid', () => {
    // 8 h, 10 cubetas a 6.50 = 65.00 → por debajo del mínimo los dos días
    const base = { buckets: 10, hours: 8, pieceRate: 6.5, minWage: 0 };

    it('Tuesday 31 March 2026 tops up to $23.50/h', () => {
        const p = dayPay({ ...base, date: '2026-03-31' });
        expect(p.minWageApplied).toBe(23.5);
        expect(p.total).toBe(188);
        expect(p.topUp).toBe(123);
    });

    it('Wednesday 1 April 2026 (same pay week) tops up to $23.95/h', () => {
        const p = dayPay({ ...base, date: '2026-04-01' });
        expect(p.minWageApplied).toBe(23.95);
        expect(p.total).toBe(191.6);
        expect(p.topUp).toBe(126.6);
    });

    it('a company rate above the legal minimum still wins', () => {
        const p = dayPay({ ...base, minWage: 25, date: '2024-06-01' });
        expect(p.minWageApplied).toBe(25);
    });

    it('public holiday multiplies the minimum of that day', () => {
        const p = dayPay({ ...base, date: '2025-04-25', isPublicHoliday: true });
        expect(p.minWageApplied).toBe(35.25);
    });
});
