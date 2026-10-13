import { describe, it, expect } from 'vitest';
import { namePreview, nzClock, quickWage } from './payrollTabsLogic';

describe('payrollTabsLogic', () => {
    it('quickWage: sin complemento cuando el piece rate supera el mínimo', () => {
        expect(quickWage(40, 8, { bucket_rate: 6.5, min_wage_rate: 23.95 })).toEqual({
            pieceRate: 260, minimumRequired: 191.6, topUp: 0, total: 260,
        });
    });

    it('quickWage: el complemento lleva el total justo al mínimo', () => {
        const r = quickWage(10, 8, { bucket_rate: 6.5, min_wage_rate: 23.95 });
        expect(r.topUp).toBeCloseTo(126.6, 6);
        expect(r.total).toBeCloseTo(191.6, 6);
    });

    it('nzClock usa hora de Auckland (NZDT en octubre) y el texto alternativo si falta', () => {
        expect(nzClock('2026-10-12T19:30:00Z', '—')).toMatch(/^0?8:30/);
        expect(nzClock(null, 'Active')).toBe('Active');
        expect(nzClock(undefined, '—')).toBe('—');
    });

    it('namePreview corta en 6 y añade puntos suspensivos', () => {
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        expect(namePreview(names)).toBe('a, b, c, d, e, f…');
        expect(namePreview(names.slice(0, 6))).toBe('a, b, c, d, e, f');
        expect(namePreview([])).toBe('');
    });
});
