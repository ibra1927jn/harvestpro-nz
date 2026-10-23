/**
 * Turnos olvidados (salida sin fichar) y tramos larguísimos: como mucho
 * PAY_RULES.maxUnreviewedShiftHours (14 h) sin corregir, se marcan para
 * revisión y, corregidos, se pagan enteros. Lo demás no cambia.
 */
import { describe, it, expect } from 'vitest';
import { shiftHours, shiftNeedsReview, payForRange, PAY_RULES, type AttendanceRow } from './pay';

const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;
const D = '2026-10-06';
const NEXT = '2026-10-07';
const MIN = 23.95;

describe('shiftHours — tope de 14 h sin corregir', () => {
    it('un turno abierto desde ayer no cuenta más de 14 h', () => {
        const r = shiftHours({ checkIn: t(D, '07:00'), now: new Date(t(NEXT, '15:00')) });
        expect(r.source).toBe('open_shift');
        expect(r.hours).toBe(14);
        expect(r.capped).toBe(true);
    });

    it('un turno abierto de 10 h sigue igual que antes (hasta ahora, sin tope)', () => {
        const r = shiftHours({ checkIn: t(D, '07:00'), now: new Date(t(D, '17:00')) });
        expect(r).toEqual({ hours: 10, grossHours: 10, breakMinutes: 0, source: 'open_shift' });
    });

    it('un tramo cerrado de 20 h sin corregir paga 14 h; corregido, las 20', () => {
        const base = { checkIn: t(D, '06:00'), checkOut: t(NEXT, '02:00') };
        expect(shiftHours(base).hours).toBe(14);
        expect(shiftHours(base).capped).toBe(true);
        const fixed = shiftHours({ ...base, corrected: true });
        expect(fixed.hours).toBe(20);
        expect(fixed.capped).toBeUndefined();
    });

    it('justo 14 h no se corta ni se marca', () => {
        const r = shiftHours({ checkIn: t(D, '05:00'), checkOut: t(D, '19:00') });
        expect(r).toEqual({ hours: 14, grossHours: 14, breakMinutes: 0, source: 'timesheet' });
    });

    it('el descanso anotado se sigue descontando dentro del tope', () => {
        const r = shiftHours({ checkIn: t(D, '06:00'), breakStart: t(D, '12:00'), now: new Date(t(NEXT, '09:00')) });
        expect(r.hours).toBe(13.5);
        expect(r.breakMinutes).toBe(30);
    });
});

describe('shiftNeedsReview', () => {
    const now = new Date(t(D, '22:00'));
    it('abierto desde hace más de 14 h → revisar', () => {
        expect(shiftNeedsReview({ checkIn: t(D, '07:00') }, now)).toBe(true);
        expect(shiftNeedsReview({ checkIn: t(D, '08:30') }, now)).toBe(false);
    });
    it('cerrado con más de 14 h → revisar, salvo que esté corregido', () => {
        const long = { checkIn: t(D, '05:00'), checkOut: t(D, '20:00') };
        expect(shiftNeedsReview(long, now)).toBe(true);
        expect(shiftNeedsReview({ ...long, corrected: true }, now)).toBe(false);
        expect(shiftNeedsReview({ checkIn: t(D, '07:00'), checkOut: t(D, '17:00') }, now)).toBe(false);
    });
    it('sin entrada no hay nada que revisar', () => {
        expect(shiftNeedsReview({ checkIn: null, checkOut: null }, now)).toBe(false);
    });
});

describe('payForRange — turnos olvidados', () => {
    const pickerId = 'p1';
    const scan = (hhmm: string, date = D) => ({ pickerId, scannedAt: t(date, hhmm), orchardId: 'o1' });

    it('abierto hoy desde hace 20 h: paga 14 h al mínimo y marca el día', () => {
        const attendance: AttendanceRow[] = [{ pickerId, date: D, orchardId: 'o1', checkIn: t(D, '02:00') }];
        const [r] = payForRange({
            attendance, buckets: [], pieceRate: 6.5, minWage: MIN, isPublicHoliday: () => false,
            now: new Date(t(D, '22:00')),
        });
        expect(r.hours).toBe(14);
        expect(r.dayDetails[0].needsReview).toBe(true);
        expect(r.dayDetails[0].estimated).toBe(true);
        expect(r.reviewDays).toBe(1);
        expect(r.topUp).toBeCloseTo(14 * MIN, 2);
    });

    it('cerrado con 18 h sin corregir: 14 h; corregido: 18 h', () => {
        const row: AttendanceRow = { pickerId, date: D, orchardId: 'o1', checkIn: t(D, '04:00'), checkOut: t(D, '22:00') };
        const now = new Date(t(NEXT, '10:00'));
        const [raw] = payForRange({ attendance: [row], buckets: [], pieceRate: 6.5, minWage: MIN, isPublicHoliday: () => false, now });
        expect(raw.hours).toBe(14);
        expect(raw.dayDetails[0].needsReview).toBe(true);
        const [fixed] = payForRange({ attendance: [{ ...row, corrected: true }], buckets: [], pieceRate: 6.5, minWage: MIN, isPublicHoliday: () => false, now });
        expect(fixed.hours).toBe(18);
        expect(fixed.dayDetails[0].needsReview).toBeUndefined();
        expect(fixed.reviewDays).toBeUndefined();
    });

    it('abierto en un día pasado: como siempre, hasta el último escaneo (sin tope si es menos)', () => {
        const attendance: AttendanceRow[] = [{ pickerId, date: D, orchardId: 'o1', checkIn: t(D, '07:00') }];
        const [r] = payForRange({
            attendance, buckets: [scan('09:00'), scan('15:00')], pieceRate: 6.5, minWage: MIN,
            isPublicHoliday: () => false, now: new Date(t(NEXT, '12:00')),
        });
        expect(r.hours).toBe(8);
        expect(r.dayDetails[0].estimated).toBe(true);
        expect(r.dayDetails[0].needsReview).toBeUndefined();
    });

    it('las cubetas se pagan todas aunque las horas se corten', () => {
        const attendance: AttendanceRow[] = [{ pickerId, date: D, orchardId: 'o1', checkIn: t(D, '02:00') }];
        const buckets = Array.from({ length: 40 }, (_, i) => scan(`${String(8 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`));
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: MIN, isPublicHoliday: () => false, now: new Date(t(D, '23:00')) });
        expect(r.buckets).toBe(40);
        expect(r.pieceEarnings).toBe(260);
        expect(r.hours).toBe(PAY_RULES.maxUnreviewedShiftHours);
    });
});
