/**
 * Reglas de pago NZ comprobadas con cifras hechas a mano y con propiedades
 * (fast-check). Complementa pay.test.ts: aqui se buscan limites y casos raros.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
    shiftHours, dayPay, nzDateOf, payWeekOf, payForRange, isNZPublicHoliday, pieceRateOn, PAY_RULES,
    type AttendanceRow, type BucketRow,
} from './pay';

const MIN = 23.95;
const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;
const cents = (n: number) => Math.round(n * 100);

describe('PAY_RULES (NZ law constants)', () => {
    it('adult minimum wage 23.95, 30 min unpaid meal break after 4 h, holidays at 1.5x', () => {
        expect(PAY_RULES).toEqual({
            mealBreakMinutes: 30,
            mealBreakAfterHours: 4,
            minWageFloor: 23.95,
            publicHolidayMultiplier: 1.5,
            timeZone: 'Pacific/Auckland',
        });
    });
});

describe('shiftHours — boundaries', () => {
    const d = '2026-10-05';

    // Owner decision 2026-10-14: only a break the team leader recorded is deducted
    it('without a recorded break nothing is deducted, at 4 h or at 4 h 01 min', () => {
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '11:00') }))
            .toEqual({ hours: 4, grossHours: 4, breakMinutes: 0, source: 'timesheet' });
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '11:01') }))
            .toEqual({ hours: 4.02, grossHours: 4.02, breakMinutes: 0, source: 'timesheet' });
    });

    it('break recorded exactly at check-in counts; recorded exactly at check-out does not', () => {
        // A la entrada: dentro del turno corto -> se descuenta
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '09:00'), breakStart: t(d, '07:00') }).breakMinutes).toBe(30);
        // A la salida: fuera del turno; turno corto -> no se descuenta
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '09:00'), breakStart: t(d, '09:00') }).breakMinutes).toBe(0);
        // Turno largo con la hora anotada justo a la salida: fuera del turno -> no se descuenta
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '12:00'), breakStart: t(d, '12:00') }).breakMinutes).toBe(0);
    });

    it('break recorded 10 min before check-out deducts only 10 min', () => {
        const r = shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '09:00'), breakStart: t(d, '08:50') });
        expect(r.breakMinutes).toBe(10);
        expect(r.hours).toBe(1.83);
    });

    it('custom break length of 0 minutes pays the whole shift', () => {
        const r = shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '17:00'), breakMinutes: 0 });
        expect(r.hours).toBe(10);
        expect(r.breakMinutes).toBe(0);
    });

    it('open shift that started "in the future" counts zero hours, not negative', () => {
        const r = shiftHours({ checkIn: t(d, '10:00'), now: new Date(t(d, '09:00')) });
        expect(r).toEqual({ hours: 0, grossHours: 0, breakMinutes: 0, source: 'open_shift' });
    });

    it('open shift uses the real clock when "now" is not given', () => {
        const checkIn = new Date(Date.now() - 2 * 3_600_000).toISOString();
        const r = shiftHours({ checkIn });
        expect(r.source).toBe('open_shift');
        expect(r.hours).toBeGreaterThanOrEqual(1.99);
        expect(r.hours).toBeLessThanOrEqual(2.01);
    });

    it('invalid or epoch timestamps are ignored', () => {
        expect(shiftHours({ checkIn: 'not a date', checkOut: t(d, '17:00') }).source).toBe('none');
        expect(shiftHours({ checkIn: '1970-01-01T00:00:00Z', checkOut: t(d, '17:00') }).source).toBe('none');
        const r = shiftHours({ scanTimes: [null, undefined, 'garbage', t(d, '08:00'), t(d, '10:00')] });
        expect(r).toEqual({ hours: 2, grossHours: 2, breakMinutes: 0, source: 'scan_estimate' });
    });

    it('scan estimate over 4 h deducts nothing (no break was recorded)', () => {
        const r = shiftHours({ scanTimes: [t(d, '15:00'), t(d, '07:00'), t(d, '11:00')] });
        expect(r).toEqual({ hours: 8, grossHours: 8, breakMinutes: 0, source: 'scan_estimate' });
    });

    it('property: paid hours = gross hours − deducted break, never negative, never above gross', () => {
        const start = Date.parse('2026-10-05T07:00:00+13:00');
        fc.assert(fc.property(
            fc.integer({ min: 1, max: 14 * 60 }), fc.option(fc.integer({ min: -60, max: 15 * 60 })), fc.integer({ min: 0, max: 60 }),
            (len, breakOffset, breakMinutes) => {
                const r = shiftHours({
                    checkIn: new Date(start).toISOString(),
                    checkOut: new Date(start + len * 60_000).toISOString(),
                    breakStart: breakOffset === null ? null : new Date(start + breakOffset * 60_000).toISOString(),
                    breakMinutes,
                });
                expect(r.hours).toBeGreaterThanOrEqual(0);
                expect(r.hours).toBeLessThanOrEqual(r.grossHours);
                expect(r.breakMinutes).toBeLessThanOrEqual(breakMinutes);
                expect(Math.abs(r.grossHours - r.breakMinutes / 60 - r.hours)).toBeLessThanOrEqual(0.011);
            },
        ), { numRuns: 400 });
    });
});

describe('dayPay — minimum wage top-up', () => {
    it('piece rate exactly at 23.95/h: no top-up and not below minimum', () => {
        const p = dayPay({ buckets: 0, pieceEarnings: 47.9, hours: 2, pieceRate: 0, minWage: MIN });
        expect(p).toMatchObject({ topUp: 0, total: 47.9, belowMinimum: false, pieceHourlyRate: 23.95, minimumEarnings: 47.9 });
    });

    it('one cent under the minimum: one cent of top-up', () => {
        const p = dayPay({ buckets: 0, pieceEarnings: 47.89, hours: 2, pieceRate: 0, minWage: MIN });
        expect(p).toMatchObject({ topUp: 0.01, total: 47.9, belowMinimum: true });
    });

    it('uses a configured minimum above the legal floor', () => {
        const p = dayPay({ buckets: 10, hours: 8, pieceRate: 6.5, minWage: 25 });
        // 8 × 25 = 200; cubetas 65 -> complemento 135
        expect(p).toMatchObject({ pieceEarnings: 65, minimumEarnings: 200, topUp: 135, total: 200, minWageApplied: 25 });
    });

    it('a configured minimum below the floor (or 0/NaN) is raised to 23.95', () => {
        for (const minWage of [20, 0, Number.NaN]) {
            const p = dayPay({ buckets: 0, hours: 1, pieceRate: 6.5, minWage });
            expect(p.minWageApplied).toBe(23.95);
            expect(p.topUp).toBe(23.95);
        }
    });

    it('negative buckets, rates and hours are clamped to zero', () => {
        expect(dayPay({ buckets: -5, hours: 2, pieceRate: 6.5, minWage: MIN })).toMatchObject({ pieceEarnings: 0, topUp: 47.9 });
        expect(dayPay({ buckets: 5, hours: 2, pieceRate: -6.5, minWage: MIN })).toMatchObject({ pieceEarnings: 0, topUp: 47.9 });
        expect(dayPay({ buckets: 0, pieceEarnings: -20, hours: 2, pieceRate: 6.5, minWage: MIN })).toMatchObject({ pieceEarnings: 0, topUp: 47.9 });
        expect(dayPay({ buckets: 5, hours: -3, pieceRate: 6.5, minWage: MIN }))
            .toMatchObject({ pieceEarnings: 32.5, topUp: 0, minimumEarnings: 0, pieceHourlyRate: 0, belowMinimum: false });
    });

    it('pieceEarnings (per-variety prices) wins over buckets × pieceRate, even when 0', () => {
        expect(dayPay({ buckets: 10, pieceEarnings: 80, hours: 1, pieceRate: 6.5, minWage: MIN }).pieceEarnings).toBe(80);
        expect(dayPay({ buckets: 10, pieceEarnings: 0, hours: 1, pieceRate: 6.5, minWage: MIN }).pieceEarnings).toBe(0);
    });

    it('public holiday: piece hourly rate × 1.5 compared with minimum × 1.5', () => {
        // 2 h, 30 de cubetas (15/h): plus 15, mínimo 2 × 35.925 = 71.85 -> complemento 26.85
        const p = dayPay({ buckets: 0, pieceEarnings: 30, hours: 2, pieceRate: 0, minWage: MIN, isPublicHoliday: true });
        expect(p).toMatchObject({ holidayPremium: 15, minimumEarnings: 71.85, topUp: 26.85, total: 71.85, minWageApplied: 35.93, belowMinimum: true });
        // Exactamente al minimo en festivo: 47.90 en 2 h -> 71.85 con el plus, sin complemento
        const q = dayPay({ buckets: 0, pieceEarnings: 47.9, hours: 2, pieceRate: 0, minWage: MIN, isPublicHoliday: true });
        expect(q).toMatchObject({ holidayPremium: 23.95, topUp: 0, total: 71.85, belowMinimum: false });
    });

    it('property: daily pay is never below minimum × hours (× 1.5 on holidays) nor below piece earnings', () => {
        fc.assert(fc.property(
            fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 0, max: 1400 }),
            fc.boolean(), fc.integer({ min: 0, max: 4000 }),
            (buckets, rateCents, hoursCents, holiday, minCents) => {
                const pieceRate = rateCents / 100;
                const hours = hoursCents / 100;
                const minWage = minCents / 100;
                const p = dayPay({ buckets, hours, pieceRate, minWage, isPublicHoliday: holiday });
                const mult = holiday ? 1.5 : 1;
                const floor = Math.max(minWage, MIN) * mult * hours;
                expect(cents(p.total)).toBeGreaterThanOrEqual(cents(floor) - 1);
                expect(cents(p.total)).toBeGreaterThanOrEqual(cents(buckets * pieceRate * mult) - 1);
                expect(p.topUp).toBeGreaterThanOrEqual(0);
                expect(cents(p.total)).toBe(cents(p.pieceEarnings) + cents(p.holidayPremium) + cents(p.topUp));
                // Si las cubetas ya llegan al minimo no hay complemento
                if (buckets * pieceRate * mult >= floor + 0.01) expect(p.topUp).toBe(0);
                expect(p.belowMinimum).toBe(hours > 0 && p.topUp > 0);
            },
        ), { numRuns: 1000 });
    });
});

describe('payWeekOf / nzDateOf / isNZPublicHoliday', () => {
    it('property: Monday–Sunday week containing the date, closing the following Monday', () => {
        fc.assert(fc.property(fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true }), (d) => {
            const ymd = d.toISOString().slice(0, 10);
            const w = payWeekOf(ymd);
            const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
            expect(new Date(`${w.start}T00:00:00Z`).getUTCDay()).toBe(1);
            expect(day(w.end) - day(w.start)).toBe(6);
            expect(day(w.closesOn) - day(w.start)).toBe(7);
            expect(day(ymd)).toBeGreaterThanOrEqual(day(w.start));
            expect(day(ymd)).toBeLessThanOrEqual(day(w.end));
        }), { numRuns: 300 });
    });

    it('week across the DST start (Sunday 2026-09-27) is still Monday 21 – Sunday 27', () => {
        expect(payWeekOf('2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-09-27', closesOn: '2026-09-28' });
        expect(payWeekOf('2026-09-28')).toEqual({ start: '2026-09-28', end: '2026-10-04', closesOn: '2026-10-05' });
    });

    it('nzDateOf accepts Date objects and uses NZ winter time (+12)', () => {
        expect(nzDateOf(new Date('2026-06-30T11:59:59Z'))).toBe('2026-06-30');
        expect(nzDateOf(new Date('2026-06-30T12:00:00Z'))).toBe('2026-07-01');
    });

    it('isNZPublicHoliday ignores the time part of a timestamp', () => {
        expect(isNZPublicHoliday('2026-12-25T08:00:00+13:00')).toBe(true);
        expect(isNZPublicHoliday('2026-12-24')).toBe(false);
    });
});

describe('payForRange — travel between orchards is split half/half', () => {
    const d = '2026-10-05';
    const now = new Date('2026-10-07T12:00:00+13:00');

    it('A → B → A: each trip split equally between the two orchards it joins', () => {
        const attendance: AttendanceRow[] = [
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '10:00'), breakStart: t(d, '09:00') },
            { pickerId: 'p1', date: d, orchardId: 'B', checkIn: t(d, '10:40'), checkOut: t(d, '14:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '14:20'), checkOut: t(d, '16:00') },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: MIN, now });
        const day = r.dayDetails[0];
        // 3 h + 40 min + 3 h 20 + 20 min + 1 h 40 = 9 h; menos 30 min anotados = 8.5 h
        expect(day.travelMinutes).toBe(60);
        expect(day.segments.map(s => s.travelHours)).toEqual([0.33, 0.5, 0.17]);
        expect(r.hours).toBe(8.5);
        expect(day.byOrchard.map(o => [o.orchardId, o.hours])).toEqual([['A', 4.88], ['B', 3.62]]);
        // Todo a salario mínimo: 8.5 × 23.95 = 203.58 (redondeado)
        expect(r.topUp).toBe(203.58);
        expect(day.byOrchard.reduce((s, o) => s + cents(o.topUp), 0)).toBe(20358);
        // Complemento repartido por peso: A 5.17/9, B 3.83/9
        expect(day.byOrchard.map(o => [o.topUp, o.total])).toEqual([[116.95, 116.95], [86.63, 86.63]]);
    });

    it('rows out of order are sorted by check-in before computing travel', () => {
        const attendance: AttendanceRow[] = [
            { pickerId: 'p1', date: d, orchardId: 'B', checkIn: t(d, '12:00'), checkOut: t(d, '14:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '08:00'), checkOut: t(d, '11:00'), breakStart: t(d, '10:00') },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: MIN, now });
        expect(r.dayDetails[0].segments.map(s => s.orchardId)).toEqual(['A', 'B']);
        expect(r.dayDetails[0].travelMinutes).toBe(60);
        expect(r.hours).toBe(5.5); // 3 + 1 + 2 − 0.5
    });

    it('a gap with unknown orchard is not paid as travel', () => {
        const attendance: AttendanceRow[] = [
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '08:00'), checkOut: t(d, '10:00') },
            { pickerId: 'p1', date: d, orchardId: null, checkIn: t(d, '11:00'), checkOut: t(d, '12:00') },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: MIN, now });
        expect(r.dayDetails[0].travelMinutes).toBe(0);
        expect(r.hours).toBe(3);
    });

    it('rows without check-in are ignored (scan estimate is used instead)', () => {
        const attendance: AttendanceRow[] = [{ pickerId: 'p1', date: d, orchardId: 'A', checkIn: null, checkOut: t(d, '12:00') }];
        const buckets: BucketRow[] = [
            { pickerId: 'p1', scannedAt: t(d, '08:00') }, { pickerId: 'p1', scannedAt: t(d, '10:00') },
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: MIN, now });
        expect(r.hours).toBe(2);
        expect(r.dayDetails[0].segments).toEqual([]);
        expect(r.estimatedDays).toBe(1);
    });

    it('open shift today followed by a shift at another orchard is not counted twice', () => {
        // Entró en A a las 08:00 sin salida y a las 12:00 entró en B; ahora son las 16:00.
        const today = '2026-10-07';
        const attendance: AttendanceRow[] = [
            { pickerId: 'p1', date: today, orchardId: 'A', checkIn: t(today, '08:00'), breakStart: t(today, '10:00') },
            { pickerId: 'p1', date: today, orchardId: 'B', checkIn: t(today, '12:00') },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: MIN, now: new Date(t(today, '16:00')) });
        // 08:00–16:00 = 8 h, menos 30 min de descanso = 7.5 h (antes daba 11.5 h)
        expect(r.hours).toBe(7.5);
        expect(r.dayDetails[0].segments.map(s => s.grossHours)).toEqual([4, 4]);
        expect(r.estimatedDays).toBe(1);
    });

    it('property: travel, hours and top-up split across orchards add up to the day totals', () => {
        const orchard = fc.constantFrom('A', 'B', 'C');
        // Como mucho 4 x (60 + 240) min desde las 03:00: siempre dentro del mismo dia NZ
        const seg = fc.record({ orchardId: orchard, gap: fc.integer({ min: 0, max: 60 }), len: fc.integer({ min: 15, max: 240 }) });
        fc.assert(fc.property(fc.array(seg, { minLength: 1, maxLength: 4 }), fc.integer({ min: 0, max: 80 }), (segs, nBuckets) => {
            let cursor = Date.parse(t(d, '03:00'));
            const attendance: AttendanceRow[] = segs.map(s => {
                const start = cursor + s.gap * 60_000;
                const end = start + s.len * 60_000;
                cursor = end;
                return { pickerId: 'p1', date: d, orchardId: s.orchardId, checkIn: new Date(start).toISOString(), checkOut: new Date(end).toISOString() };
            });
            const buckets: BucketRow[] = Array.from({ length: nBuckets }, (_, i) => ({
                pickerId: 'p1', scannedAt: attendance[i % attendance.length].checkIn as string, orchardId: attendance[i % attendance.length].orchardId,
            }));
            const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: MIN, now });
            const day = r.dayDetails[0];
            // Trayecto: solo huecos entre huertos distintos, mitad y mitad
            let travel = 0;
            for (let i = 1; i < segs.length; i++) if (segs[i].orchardId !== segs[i - 1].orchardId) travel += segs[i].gap;
            expect(day.travelMinutes).toBe(travel);
            const travelSum = day.segments.reduce((s, x) => s + x.travelHours, 0);
            expect(Math.abs(travelSum - travel / 60)).toBeLessThanOrEqual(0.01 * segs.length);
            expect(day.byOrchard.reduce((s, o) => s + cents(o.hours), 0)).toBe(cents(day.hours));
            expect(day.byOrchard.reduce((s, o) => s + cents(o.topUp), 0)).toBe(cents(day.topUp));
            expect(day.byOrchard.reduce((s, o) => s + cents(o.total), 0)).toBe(cents(day.total));
            expect(day.byOrchard.reduce((s, o) => s + o.buckets, 0)).toBe(nBuckets);
            // Nunca por debajo del minimo por las horas del dia
            expect(cents(day.total)).toBeGreaterThanOrEqual(cents(day.hours * MIN) - 1);
        }), { numRuns: 300 });
    });
});

describe('payForRange — aggregation', () => {
    const d1 = '2026-10-05', d2 = '2026-10-06';
    const now = new Date('2026-10-12T12:00:00+13:00');

    it('several pickers sorted by buckets, days kept apart, rejected buckets ignored', () => {
        const buckets: BucketRow[] = [
            ...Array.from({ length: 3 }, () => ({ pickerId: 'a-low', scannedAt: t(d1, '09:00') })),
            ...Array.from({ length: 5 }, () => ({ pickerId: 'z-high', scannedAt: t(d1, '09:00') })),
            ...Array.from({ length: 4 }, () => ({ pickerId: 'z-high', scannedAt: t(d2, '09:00') })),
            { pickerId: 'z-high', scannedAt: t(d2, '09:30'), qualityGrade: 'reject' },
            { pickerId: 'z-high', scannedAt: 'garbage' },
        ];
        const rows = payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: MIN, now });
        // Ordenado por cubetas (no por nombre)
        expect(rows.map(r => [r.pickerId, r.buckets, r.days])).toEqual([['z-high', 9, 2], ['a-low', 3, 1]]);
        expect(rows[0].dayDetails.map(x => x.date)).toEqual([d1, d2]);
        // Sin horas (todos los escaneos a la misma hora): solo cubetas
        expect(rows[0].total).toBe(58.5);
        expect(rows[0].daysBelowMinimum).toBe(0);
    });

    it('weekly totals equal the sum of the day details', () => {
        const attendance: AttendanceRow[] = [d1, d2].map(date => ({ pickerId: 'p1', date, checkIn: t(date, '07:00'), checkOut: t(date, '15:30'), breakStart: t(date, '12:00') }));
        const buckets: BucketRow[] = [
            ...Array.from({ length: 33 }, () => ({ pickerId: 'p1', scannedAt: t(d1, '10:00'), variety: 'Gala', pieceRate: 6.1 })),
            ...Array.from({ length: 12 }, () => ({ pickerId: 'p1', scannedAt: t(d2, '10:00'), variety: 'Envy', pieceRate: 7.35 })),
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: MIN, now });
        // Día 1: 8 h, 201.30 de cubetas >= 191.60 -> sin complemento
        // Día 2: 8 h, 88.20 de cubetas -> complemento 103.40
        expect(r.dayDetails.map(x => [x.pieceEarnings, x.topUp, x.total])).toEqual([[201.3, 0, 201.3], [88.2, 103.4, 191.6]]);
        expect(r.total).toBe(392.9);
        expect(r.topUp).toBe(103.4);
        expect(r.hours).toBe(16);
        expect(r.daysBelowMinimum).toBe(1);
        expect(r.dayDetails[1].pieceLines).toEqual([{ variety: 'Envy', rate: 7.35, buckets: 12, earnings: 88.2 }]);
    });

    it('a day with only a closed zero-length shift and no buckets is dropped', () => {
        const attendance: AttendanceRow[] = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00'), checkOut: t(d1, '07:00') }];
        expect(payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: MIN, now })).toEqual([]);
    });

    it('piece lines are grouped by variety and price, sorted by variety then price', () => {
        const buckets: BucketRow[] = [
            { pickerId: 'p1', scannedAt: t(d1, '09:00'), variety: 'Gala', pieceRate: 7 },
            { pickerId: 'p1', scannedAt: t(d1, '09:01'), variety: 'Gala', pieceRate: 6.5 },
            { pickerId: 'p1', scannedAt: t(d1, '09:02'), variety: 'Gala', pieceRate: 7 },
            { pickerId: 'p1', scannedAt: t(d1, '09:03'), variety: 'Braeburn', pieceRate: 8 },
            { pickerId: 'p1', scannedAt: t(d1, '09:04') },
        ];
        const [r] = payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: MIN, now });
        expect(r.dayDetails[0].pieceLines).toEqual([
            { variety: 'Braeburn', rate: 8, buckets: 1, earnings: 8 },
            { variety: 'Gala', rate: 6.5, buckets: 1, earnings: 6.5 },
            { variety: 'Gala', rate: 7, buckets: 2, earnings: 14 },
            { variety: '—', rate: 6.5, buckets: 1, earnings: 6.5 },
        ].sort((a, b) => a.variety.localeCompare(b.variety) || a.rate - b.rate));
        expect(r.dayDetails[0].bucketsByVariety).toEqual({ Gala: 3, Braeburn: 1, '—': 1 });
    });

    it('property: no bucket is lost or counted twice', () => {
        const pickers = fc.constantFrom('p1', 'p2', 'p3');
        const scan = fc.record({ pickerId: pickers, minute: fc.integer({ min: 0, max: 7 * 24 * 60 }), reject: fc.boolean() });
        fc.assert(fc.property(fc.array(scan, { maxLength: 120 }), (scans) => {
            const base = Date.parse('2026-10-04T11:00:00Z'); // lunes 00:00 NZDT
            const buckets: BucketRow[] = scans.map(s => ({
                pickerId: s.pickerId, scannedAt: new Date(base + s.minute * 60_000).toISOString(), qualityGrade: s.reject ? 'reject' : 'A',
            }));
            const rows = payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: MIN, now });
            const good = scans.filter(s => !s.reject);
            expect(rows.reduce((s, r) => s + r.buckets, 0)).toBe(good.length);
            for (const r of rows) {
                expect(r.buckets).toBe(good.filter(s => s.pickerId === r.pickerId).length);
                expect(r.dayDetails.reduce((s, x) => s + x.buckets, 0)).toBe(r.buckets);
                expect(cents(r.total)).toBe(r.dayDetails.reduce((s, x) => s + cents(x.total), 0));
            }
        }), { numRuns: 200 });
    });
});

describe('pieceRateOn — edge cases', () => {
    const rates = [
        { orchardId: 'A', variety: ' Royal Gala ', effectiveDate: '2026-10-01', pieceRate: 7.2 },
        { orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 6.4 },
        { orchardId: 'Z', variety: null, effectiveDate: '2026-10-01', pieceRate: 0 },
    ];

    it('matches varieties ignoring case and surrounding spaces', () => {
        expect(pieceRateOn(rates, 'A', 'ROYAL GALA', '2026-10-02', 6.5)).toBe(7.2);
        expect(pieceRateOn(rates, 'A', 'royal gala  ', '2026-10-02', 6.5)).toBe(7.2);
    });

    it('bucket without orchard uses the fallback', () => {
        expect(pieceRateOn(rates, undefined, 'Royal Gala', '2026-10-02', 6.9)).toBe(6.9);
    });

    it('unknown variety falls back to the orchard price, then to the fallback', () => {
        expect(pieceRateOn(rates, 'A', 'Envy', '2026-10-02', 6.5)).toBe(6.4);
        expect(pieceRateOn(rates, 'B', 'Envy', '2026-10-02', 6.5)).toBe(6.5);
        expect(pieceRateOn(rates, 'A', '   ', '2026-10-02', 6.5)).toBe(6.4);
        expect(pieceRateOn([], 'A', null, '2026-10-02', 6.5)).toBe(6.5);
        expect(pieceRateOn([], 'A', 'Envy', '2026-10-02', 6.5)).toBe(6.5);
    });

    it('an orchard price of 0 is respected (not treated as missing)', () => {
        expect(pieceRateOn(rates, 'Z', 'Envy', '2026-10-02', 6.5)).toBe(0);
    });

    it('the same list gives the same answer on repeated calls (index cache)', () => {
        for (let i = 0; i < 3; i++) expect(pieceRateOn(rates, 'A', 'Royal Gala', '2026-10-02', 6.5)).toBe(7.2);
        expect(pieceRateOn(rates, 'A', 'Royal Gala', '2026-09-30', 6.5)).toBe(6.5);
    });
});

describe('payForRange — segments, breaks and orchard split details', () => {
    const d = '2026-10-05';
    const now = new Date('2026-10-12T12:00:00+13:00');
    const run = (attendance: AttendanceRow[], buckets: BucketRow[] = [], at = now) =>
        payForRange({ attendance, buckets, pieceRate: 6.5, minWage: MIN, now: at });

    it('every NZ public holiday listed in nz-law is a holiday for pay, the day after is not', async () => {
        const law = await import('@/constants/nz-law');
        for (const h of law.NZ_PUBLIC_HOLIDAYS) expect(isNZPublicHoliday(h)).toBe(true);
        expect(isNZPublicHoliday('2026-10-27')).toBe(false);
    });

    it('check-out equal to check-in is not a shift (no hours, source none)', () => {
        expect(shiftHours({ checkIn: t(d, '07:00'), checkOut: t(d, '07:00') }).source).toBe('none');
    });

    it('segment details: times, open flag, break and gross hours per segment', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '11:00'), breakStart: t(d, '10:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '12:00') },
        ], [{ pickerId: 'p1', scannedAt: t(d, '14:30'), orchardId: 'A' }]);
        expect(r.dayDetails[0].segments).toEqual([
            { orchardId: 'A', checkIn: t(d, '07:00'), checkOut: '2026-10-04T22:00:00.000Z', open: false, breakStart: t(d, '10:00'), grossHours: 4, travelHours: 0 },
            { orchardId: 'A', checkIn: t(d, '12:00'), checkOut: '2026-10-05T01:30:00.000Z', open: true, breakStart: null, grossHours: 2.5, travelHours: 0 },
        ]);
        // 4 + 2.5 h, descanso anotado de 30 min en el primer tramo -> 6 h
        expect(r.hours).toBe(6);
        expect(r.dayDetails[0].breakMinutes).toBe(30);
    });

    it('break length comes from the first row that has one; in-progress break counts only the elapsed part', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '10:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '10:30'), checkOut: t(d, '13:00'), breakMinutes: 45, breakStart: t(d, '12:50') },
        ]);
        // Descanso anotado a las 12:50 y el tramo acaba a las 13:00: solo 10 min
        expect(r.dayDetails[0].breakMinutes).toBe(10);
        expect(r.hours).toBe(5.33); // 3 + 2.5 - 10/60
        const [q] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '10:00'), breakMinutes: 45 },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '10:30'), checkOut: t(d, '13:00'), breakStart: t(d, '11:00') },
        ]);
        expect(q.dayDetails[0].breakMinutes).toBe(45);
        expect(q.hours).toBe(4.75);
        // Una duración sin hora anotada no descuenta nada
        const [n] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '10:00'), breakMinutes: 45 },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '10:30'), checkOut: t(d, '13:00') },
        ]);
        expect(n.dayDetails[0].breakMinutes).toBe(0);
        expect(n.hours).toBe(5.5);
    });

    it('a break recorded exactly at the end of a segment does not count (not deducted)', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '09:00'), breakStart: t(d, '09:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '09:30'), checkOut: t(d, '11:00') },
        ]);
        // 3.5 h en total (<= 4 h): sin descanso
        expect(r.dayDetails[0].breakMinutes).toBe(0);
        expect(r.hours).toBe(3.5);
    });

    it('several segments adding up to exactly 4 h: no meal break deducted', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '09:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '10:00'), checkOut: t(d, '12:00') },
        ]);
        expect(r.hours).toBe(4);
    });

    it('past day: an open segment ends at its own orchard\'s last scan before the next segment', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00') },
            { pickerId: 'p1', date: d, orchardId: 'B', checkIn: t(d, '12:00'), checkOut: t(d, '15:00'), breakStart: t(d, '13:30') },
        ], [
            { pickerId: 'p1', scannedAt: t(d, '09:00'), orchardId: 'A' },
            { pickerId: 'p1', scannedAt: t(d, '11:00'), orchardId: 'A' },
            { pickerId: 'p1', scannedAt: t(d, '11:30'), orchardId: 'B' }, // otro huerto: no alarga A
            { pickerId: 'p1', scannedAt: t(d, '13:00'), orchardId: 'A' }, // despues de entrar en B: no alarga A
        ]);
        const day = r.dayDetails[0];
        expect(day.segments.map(s => s.grossHours)).toEqual([4, 3]);
        // 4 h + 1 h de trayecto + 3 h - 30 min
        expect(day.travelMinutes).toBe(60);
        expect(r.hours).toBe(7.5);
        expect(day.estimated).toBe(true);
    });

    it('without attendance the day is split between orchards by buckets', () => {
        const [r] = run([], [
            { pickerId: 'p1', scannedAt: t(d, '08:00'), orchardId: 'B' },
            { pickerId: 'p1', scannedAt: t(d, '09:00'), orchardId: 'B' },
            { pickerId: 'p1', scannedAt: t(d, '10:00'), orchardId: 'B' },
            { pickerId: 'p1', scannedAt: t(d, '11:00'), orchardId: 'A' },
        ]);
        // 3 h estimadas: 3/4 a B, 1/4 a A; ordenado por huerto
        expect(r.dayDetails[0].byOrchard.map(o => [o.orchardId, o.hours, o.buckets])).toEqual([['A', 0.75, 1], ['B', 2.25, 3]]);
    });

    it('leftover cents go to the orchard with the biggest share so orchards add up to the day', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'C', checkIn: t(d, '07:00'), checkOut: t(d, '07:20') },
            { pickerId: 'p1', date: d, orchardId: 'B', checkIn: t(d, '07:20'), checkOut: t(d, '07:40') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:40'), checkOut: t(d, '08:00') },
        ]);
        const by = r.dayDetails[0].byOrchard;
        expect(by.map(o => o.orchardId)).toEqual(['A', 'B', 'C']);
        expect(by.reduce((s, o) => s + cents(o.hours), 0)).toBe(100);
        expect(by.reduce((s, o) => s + cents(o.topUp), 0)).toBe(cents(r.topUp));
        // Pesos iguales: el ajuste va al primero con el mayor peso (C, el primer tramo)
        expect(by.find(o => o.orchardId === 'C')?.hours).toBe(0.34);
    });

    it('days come out in date order even if attendance arrives unordered', () => {
        const d2 = '2026-10-06';
        const [r] = run([
            { pickerId: 'p1', date: d2, checkIn: t(d2, '07:00'), checkOut: t(d2, '09:00') },
            { pickerId: 'p1', date: d, checkIn: t(d, '07:00'), checkOut: t(d, '09:00') },
        ]);
        expect(r.dayDetails.map(x => x.date)).toEqual([d, d2]);
    });

    it('past day with one closed and one open segment is flagged estimated', () => {
        const [r] = run([
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '09:00') },
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '10:00') },
        ]);
        expect(r.estimatedDays).toBe(1);
        expect(r.hours).toBe(2);
    });

    it('open shift today that starts right now is not listed yet', () => {
        const today = '2026-10-12';
        expect(run([{ pickerId: 'p1', date: today, checkIn: t(today, '12:00') }], [], new Date(t(today, '12:00')))).toEqual([]);
    });
});

describe('payForRange — holiday split and stale shifts', () => {
    const d = '2026-10-05';
    const now = new Date('2026-10-12T12:00:00+13:00');

    it('holiday with two orchards: each orchard total = its buckets + their premium + its top-up share', () => {
        const [r] = payForRange({
            attendance: [
                { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '09:00') },
                { pickerId: 'p1', date: d, orchardId: 'B', checkIn: t(d, '09:00'), checkOut: t(d, '11:00') },
            ],
            buckets: [
                ...Array.from({ length: 4 }, () => ({ pickerId: 'p1', scannedAt: t(d, '08:00'), orchardId: 'A', pieceRate: 6.5 })),
                ...Array.from({ length: 2 }, () => ({ pickerId: 'p1', scannedAt: t(d, '10:00'), orchardId: 'B', pieceRate: 6.5 })),
            ],
            pieceRate: 6.5, minWage: MIN, now, isPublicHoliday: () => true,
        });
        // 4 h a 23.95 x 1.5 = 143.70; cubetas 39 + plus 19.50 -> complemento 85.20 (mitad por huerto)
        expect(r.dayDetails[0].byOrchard).toEqual([
            { orchardId: 'A', hours: 2, buckets: 4, pieceEarnings: 26, holidayPremium: 13, topUp: 42.6, total: 81.6 },
            { orchardId: 'B', hours: 2, buckets: 2, pieceEarnings: 13, holidayPremium: 6.5, topUp: 42.6, total: 62.1 },
        ]);
        expect(r.total).toBe(143.7);
    });

    it('buckets without orchard are reported under orchard null', () => {
        const [r] = payForRange({ attendance: [], buckets: [{ pickerId: 'p1', scannedAt: t(d, '08:00') }], pieceRate: 6.5, minWage: MIN, now });
        expect(r.dayDetails[0].byOrchard.map(o => o.orchardId)).toEqual([null]);
    });

    it('past day with a zero-length closed segment and an open one without buckets is kept (0 h, estimated)', () => {
        const rows = payForRange({
            attendance: [
                { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '07:00'), checkOut: t(d, '07:00') },
                { pickerId: 'p1', date: d, orchardId: 'A', checkIn: t(d, '08:00') },
            ],
            buckets: [], pieceRate: 6.5, minWage: MIN, now,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ hours: 0, estimatedDays: 1 });
    });
});
