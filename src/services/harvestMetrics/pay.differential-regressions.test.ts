/**
 * Fallos encontrados por la prueba diferencial de nómina
 * (src/test/payroll-reference): casos mínimos, con cifras hechas a mano.
 */
import { describe, it, expect } from 'vitest';
import { payForRange } from './pay';

const MIN = 23.95;
// Octubre: NZDT (+13)
const nz = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+13:00`).toISOString();

describe('payForRange — tramos solapados', () => {
    it('dos tramos que se solapan media hora no pagan esa media hora dos veces', () => {
        // 08:00–12:00 y 11:30–15:00 en el mismo huerto = 7 h reales − 30 min de comida = 6.5 h
        const [p] = payForRange({
            attendance: [
                { pickerId: 'p1', date: '2026-10-14', orchardId: 'o1', checkIn: nz('2026-10-14', '08:00'), checkOut: nz('2026-10-14', '12:00') },
                { pickerId: 'p1', date: '2026-10-14', orchardId: 'o1', checkIn: nz('2026-10-14', '11:30'), checkOut: nz('2026-10-14', '15:00') },
            ],
            buckets: [],
            pieceRate: 6.5,
            minWage: MIN,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        expect(p.hours).toBe(6.5);
        expect(p.total).toBe(155.68); // 6.5 × 23.95 = 155.675
    });

    it('un tramo entero dentro de otro (de otro huerto) no inventa trayectos', () => {
        // A 08:00–14:00 contiene B 09:00–09:10; luego A otra vez 15:00–16:00.
        // Real: 7 h en A, sin trayecto (de A a A no se paga) − 30 min = 6.5 h
        const [p] = payForRange({
            attendance: [
                { pickerId: 'p1', date: '2026-10-14', orchardId: 'A', checkIn: nz('2026-10-14', '08:00'), checkOut: nz('2026-10-14', '14:00') },
                { pickerId: 'p1', date: '2026-10-14', orchardId: 'B', checkIn: nz('2026-10-14', '09:00'), checkOut: nz('2026-10-14', '09:10') },
                { pickerId: 'p1', date: '2026-10-14', orchardId: 'A', checkIn: nz('2026-10-14', '15:00'), checkOut: nz('2026-10-14', '16:00') },
            ],
            buckets: [],
            pieceRate: 6.5,
            minWage: MIN,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        expect(p.dayDetails[0].travelMinutes).toBe(0);
        expect(p.hours).toBe(6.5);
    });
});

describe('payForRange — turno que cruza la medianoche', () => {
    it('las cubetas de después de medianoche son del día del turno (no un día aparte con horas estimadas)', () => {
        // Turno 20:00 → 02:00: 6 h − 30 min = 5.5 h. 10 cubetas a las 21:00 y 10 a la 01:00, a 6.50.
        // Día del turno: 20 cubetas = 130.00; mínimo 5.5 × 23.95 = 131.725 → complemento 1.73.
        const buckets = [
            ...Array.from({ length: 10 }, () => ({ pickerId: 'p1', scannedAt: nz('2026-10-14', '21:00'), pieceRate: 6.5 })),
            ...Array.from({ length: 10 }, (_, i) => ({ pickerId: 'p1', scannedAt: nz('2026-10-15', `01:0${i}`), pieceRate: 6.5 })),
        ];
        const [p] = payForRange({
            attendance: [{ pickerId: 'p1', date: '2026-10-14', orchardId: 'o1', checkIn: nz('2026-10-14', '20:00'), checkOut: nz('2026-10-15', '02:00') }],
            buckets,
            pieceRate: 6.5,
            minWage: MIN,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        expect(p.dayDetails.map(d => d.date)).toEqual(['2026-10-14']);
        expect(p.hours).toBe(5.5);
        expect(p.buckets).toBe(20);
        expect(p.pieceEarnings).toBe(130);
        expect(p.topUp).toBe(1.73);
        expect(p.total).toBe(131.73);
    });

    it('una cubeta del día siguiente fuera de cualquier turno sigue siendo de su día', () => {
        const [p] = payForRange({
            attendance: [{ pickerId: 'p1', date: '2026-10-14', orchardId: 'o1', checkIn: nz('2026-10-14', '08:00'), checkOut: nz('2026-10-14', '12:00') }],
            buckets: [{ pickerId: 'p1', scannedAt: nz('2026-10-15', '09:00'), pieceRate: 6.5 }],
            pieceRate: 6.5,
            minWage: MIN,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        expect(p.dayDetails.map(d => [d.date, d.buckets])).toEqual([['2026-10-14', 0], ['2026-10-15', 1]]);
    });
});

describe('dayPay — el complemento nunca deja el día bajo el mínimo', () => {
    it('5.5 h × 23.95 = 131.725: con 130.00 de cubetas el complemento es 1.73 (antes 1.72)', async () => {
        const { dayPay } = await import('./pay');
        const p = dayPay({ buckets: 20, pieceEarnings: 130, hours: 5.5, pieceRate: 6.5, minWage: MIN });
        expect(p.topUp).toBe(1.73);
        expect(p.total).toBeGreaterThanOrEqual(5.5 * MIN);
    });

    it('si el mínimo cae justo en céntimos no se sube ni un céntimo de más', async () => {
        const { dayPay } = await import('./pay');
        // 8 h × 23.95 = 191.60 exacto
        expect(dayPay({ buckets: 0, hours: 8, pieceRate: 6.5, minWage: MIN }).topUp).toBe(191.6);
        // festivo: 4 h × 23.95 × 1.5 = 143.70 exacto
        expect(dayPay({ buckets: 0, hours: 4, pieceRate: 6.5, minWage: MIN, isPublicHoliday: true }).topUp).toBe(143.7);
    });
});
