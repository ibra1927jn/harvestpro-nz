/**
 * harvestMetrics/projection.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeHoursElapsed } from './projection';

// Fecha fija: 14 Apr 2026, 10:00 NZ (+12 → UTC 22:00 del 13)
const NZ_OFFSET_H = 12;
const BASE = '2026-04-14';
function nzDate(timeHHMM: string): Date {
    return new Date(`${BASE}T${timeHHMM}:00+${String(NZ_OFFSET_H).padStart(2, '0')}:00`);
}

describe('computeHoursElapsed', () => {
    it('retorna 0 si now es antes del shift start', () => {
        const now = nzDate('06:30'); // antes de las 07:00
        expect(computeHoursElapsed('07:00', now)).toBe(0);
    });

    it('calcula horas correctamente a mitad del turno', () => {
        const now = nzDate('10:00'); // 3h después de 07:00
        expect(computeHoursElapsed('07:00', now)).toBeCloseTo(3, 1);
    });

    it('nunca retorna negativo', () => {
        const now = nzDate('05:00');
        expect(computeHoursElapsed('07:00', now)).toBeGreaterThanOrEqual(0);
    });
});
