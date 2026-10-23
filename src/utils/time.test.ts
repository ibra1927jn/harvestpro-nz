/**
 * time.test.ts — Tests para utilidades de tiempo NZ.
 *
 * Usa fechas fijas para ser independiente del timezone de la maquina CI.
 */
import { describe, it, expect } from 'vitest';
import {
    formatHourLabel,
    toNZISO,
    getNZHour,
    getNZMinute,
    getNZShiftBoundaryMs,
    buildShiftSlots,
    buildShiftSlotsUntilNow,
} from './time';

// 2026-06-15 12:00Z cae en NZST (+12:00) → NZ 2026-06-16 00:00
const NZST_UTC = new Date('2026-06-15T12:00:00Z');
// 2026-02-15 11:00Z cae en NZDT (+13:00) → NZ 2026-02-16 00:00
const NZDT_UTC = new Date('2026-02-15T11:00:00Z');

describe('formatHourLabel', () => {
    it('pads single-digit hours with leading zero', () => {
        expect(formatHourLabel(0)).toBe('00');
        expect(formatHourLabel(7)).toBe('07');
        expect(formatHourLabel(9)).toBe('09');
    });

    it('leaves double-digit hours unchanged', () => {
        expect(formatHourLabel(10)).toBe('10');
        expect(formatHourLabel(14)).toBe('14');
        expect(formatHourLabel(23)).toBe('23');
    });
});

describe('toNZISO', () => {
    it('returns +12:00 offset during NZST (standard time)', () => {
        expect(toNZISO(NZST_UTC)).toBe('2026-06-16T00:00:00+12:00');
    });

    it('returns +13:00 offset during NZDT (daylight saving)', () => {
        expect(toNZISO(NZDT_UTC)).toBe('2026-02-16T00:00:00+13:00');
    });
});

describe('getNZHour', () => {
    it('returns NZ local hour in NZST', () => {
        // NZ 2026-06-16 00:00 → hora 0
        expect(getNZHour(NZST_UTC)).toBe(0);
        // +7h → 07:00 NZ
        expect(getNZHour(new Date('2026-06-15T19:00:00Z'))).toBe(7);
    });

    it('returns NZ local hour in NZDT', () => {
        // NZ 2026-02-16 00:00 → hora 0
        expect(getNZHour(NZDT_UTC)).toBe(0);
        // +7h → 07:00 NZ
        expect(getNZHour(new Date('2026-02-15T18:00:00Z'))).toBe(7);
    });
});

describe('getNZMinute', () => {
    it('returns minute 0-59 in NZ', () => {
        expect(getNZMinute(NZST_UTC)).toBe(0);
        expect(getNZMinute(new Date('2026-06-15T12:37:00Z'))).toBe(37);
        expect(getNZMinute(new Date('2026-06-15T12:59:00Z'))).toBe(59);
    });
});

describe('getNZShiftBoundaryMs', () => {
    it('returns the ms timestamp for HH:MM on the NZ day of the reference (NZST)', () => {
        // ref NZ = 2026-06-16 00:00. Boundary 07:00 → 2026-06-16T07:00+12:00 = 2026-06-15T19:00Z
        const ms = getNZShiftBoundaryMs('07:00', NZST_UTC);
        expect(new Date(ms).toISOString()).toBe('2026-06-15T19:00:00.000Z');
    });

    it('returns the ms timestamp for HH:MM on the NZ day of the reference (NZDT)', () => {
        // ref NZ = 2026-02-16 00:00. Boundary 17:00 → 2026-02-16T17:00+13:00 = 2026-02-16T04:00Z
        const ms = getNZShiftBoundaryMs('17:00', NZDT_UTC);
        expect(new Date(ms).toISOString()).toBe('2026-02-16T04:00:00.000Z');
    });
});

describe('buildShiftSlots', () => {
    it('builds hourly slots from startHH to endHH (end exclusive)', () => {
        const slots = buildShiftSlots('07:00', '10:00', NZST_UTC);
        expect(slots).toHaveLength(3);
        expect(slots.map(s => s.hour)).toEqual([7, 8, 9]);
    });

    it('slot endMs equals next slot startMs (contiguous hours)', () => {
        const slots = buildShiftSlots('06:00', '09:00', NZST_UTC);
        expect(slots[0].slotEndMs).toBe(slots[1].slotStartMs);
        expect(slots[1].slotEndMs).toBe(slots[2].slotStartMs);
    });

    it('each slot spans exactly one hour in ms', () => {
        const slots = buildShiftSlots('07:00', '09:00', NZST_UTC);
        for (const slot of slots) {
            expect(slot.slotEndMs - slot.slotStartMs).toBe(3_600_000);
        }
    });

    it('returns empty array when start equals end', () => {
        expect(buildShiftSlots('07:00', '07:00', NZST_UTC)).toEqual([]);
    });

    it('uses NZDT offset for dates in daylight saving', () => {
        const slots = buildShiftSlots('07:00', '08:00', NZDT_UTC);
        // 07:00 NZDT → 2026-02-15T18:00Z
        expect(new Date(slots[0].slotStartMs).toISOString()).toBe('2026-02-15T18:00:00.000Z');
    });
});

describe('buildShiftSlotsUntilNow', () => {
    // Sin hora de fin de turno: la ventana va del inicio hasta la hora actual NZ (incluida)
    it('builds slots from shift start up to and including the current NZ hour', () => {
        // NZST: 2026-06-16 00:00 NZ + 10 h 30 → 10:30 NZ
        const now = new Date(NZST_UTC.getTime() + 10.5 * 3_600_000);
        const slots = buildShiftSlotsUntilNow('07:00', now);
        expect(slots.map(s => s.hour)).toEqual([7, 8, 9, 10]);
        expect(slots[slots.length - 1].slotEndMs).toBeGreaterThan(now.getTime());
    });

    it('returns only the first slot before the shift has started', () => {
        // 05:00 NZ
        const now = new Date(NZST_UTC.getTime() + 5 * 3_600_000);
        expect(buildShiftSlotsUntilNow('07:00', now).map(s => s.hour)).toEqual([7]);
    });

    it('grows during the day and never passes midnight', () => {
        const at15 = new Date(NZDT_UTC.getTime() + 15 * 3_600_000);
        const at23 = new Date(NZDT_UTC.getTime() + 23.5 * 3_600_000);
        expect(buildShiftSlotsUntilNow('06:00', at15)).toHaveLength(10); // 6..15
        const late = buildShiftSlotsUntilNow('06:00', at23);
        expect(late[late.length - 1].hour).toBe(23);
    });

    it('uses the NZ offset of the reference day (NZDT)', () => {
        const now = new Date(NZDT_UTC.getTime() + 8 * 3_600_000); // 08:00 NZDT
        const slots = buildShiftSlotsUntilNow('07:00', now);
        // 07:00 NZDT → 2026-02-15T18:00Z
        expect(new Date(slots[0].slotStartMs).toISOString()).toBe('2026-02-15T18:00:00.000Z');
        expect(slots.map(s => s.hour)).toEqual([7, 8]);
    });
});
