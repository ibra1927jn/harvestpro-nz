import { describe, it, expect } from 'vitest';
import { shiftHours, dayPay, nzDateOf, payWeekOf, payForRange, isNZPublicHoliday, PAY_RULES } from './pay';

// Fechas en NZDT (UTC+13) — 11 oct 2026
const at = (hhmm: string) => `2026-10-11T${hhmm}:00+13:00`;

describe('shiftHours', () => {
    it('jornada completa sin descanso anotado: descuenta 30 min', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00') });
        expect(r).toEqual({ hours: 9.5, grossHours: 10, breakMinutes: 30, source: 'timesheet' });
    });

    it('descanso anotado por el team leader dentro del turno: descuenta 30 min', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), breakStart: at('12:00') });
        expect(r.hours).toBe(9.5);
        expect(r.breakMinutes).toBe(30);
    });

    it('descanso anotado fuera de un turno corto: no descuenta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('11:00'), breakStart: at('12:00') });
        expect(r.hours).toBe(4);
        expect(r.breakMinutes).toBe(0);
    });

    it('descanso anotado fuera de un turno largo (error al anotar): regla por defecto', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('16:00'), breakStart: '2026-10-10T12:00:00+13:00' });
        expect(r.hours).toBe(8.5);
    });

    it('turno corto (≤ 4 h) sin descanso anotado: no descuenta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('10:00') });
        expect(r.hours).toBe(3);
        expect(r.breakMinutes).toBe(0);
    });

    it('respeta una duración de descanso distinta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), breakMinutes: 45 });
        expect(r.hours).toBe(9.25);
    });

    it('turno abierto: cuenta hasta ahora', () => {
        const r = shiftHours({ checkIn: at('07:00'), now: new Date(at('10:00')) });
        expect(r).toEqual({ hours: 3, grossHours: 3, breakMinutes: 0, source: 'open_shift' });
    });

    it('turno abierto en pleno descanso: descuenta solo lo transcurrido', () => {
        const r = shiftHours({ checkIn: at('07:00'), breakStart: at('12:00'), now: new Date(at('12:10')) });
        expect(r.breakMinutes).toBe(10);
        expect(r.hours).toBe(5);
    });

    it('sin fichaje: estima por primer y último escaneo', () => {
        const r = shiftHours({ scanTimes: [at('08:00'), at('13:30'), null, at('15:00')] });
        expect(r.source).toBe('scan_estimate');
        expect(r.grossHours).toBe(7);
        expect(r.hours).toBe(6.5);
    });

    it('el fichaje manda sobre los escaneos', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), scanTimes: [at('09:00'), at('10:00')] });
        expect(r.source).toBe('timesheet');
        expect(r.hours).toBe(9.5);
    });

    it('sin nada: cero horas y fuente "none"', () => {
        expect(shiftHours({})).toEqual({ hours: 0, grossHours: 0, breakMinutes: 0, source: 'none' });
    });

    it('salida anterior a la entrada: no inventa horas', () => {
        const r = shiftHours({ checkIn: at('17:00'), checkOut: at('07:00') });
        expect(r.hours).toBe(0);
    });
});

describe('dayPay', () => {
    it('por debajo del mínimo: complemento hasta el mínimo', () => {
        // 12 cubetas × 6.50 = 78; 9.5 h × 23.95 = 227.525
        const p = dayPay({ buckets: 12, hours: 9.5, pieceRate: 6.5, minWage: 23.95 });
        expect(p.pieceEarnings).toBe(78);
        expect(p.minimumEarnings).toBe(227.53);
        expect(p.topUp).toBe(149.53);
        expect(p.total).toBe(227.53);
        expect(p.belowMinimum).toBe(true);
    });

    it('por encima del mínimo: sin complemento', () => {
        const p = dayPay({ buckets: 60, hours: 9.5, pieceRate: 6.5, minWage: 23.95 });
        expect(p.topUp).toBe(0);
        expect(p.total).toBe(390);
        expect(p.belowMinimum).toBe(false);
    });

    it('nunca usa un mínimo por debajo del legal', () => {
        const p = dayPay({ buckets: 0, hours: 1, pieceRate: 6.5, minWage: 20 });
        expect(p.minWageApplied).toBe(PAY_RULES.minWageFloor);
    });

    it('festivo: mínimo a 1.5x', () => {
        const p = dayPay({ buckets: 0, hours: 2, pieceRate: 6.5, minWage: 23.95, isPublicHoliday: true });
        expect(p.minWageApplied).toBe(35.93);
        expect(p.topUp).toBe(71.85);
    });

    it('sin horas: no hay complemento ni "por debajo del mínimo"', () => {
        const p = dayPay({ buckets: 5, hours: 0, pieceRate: 6.5, minWage: 23.95 });
        expect(p.topUp).toBe(0);
        expect(p.belowMinimum).toBe(false);
    });

    it('el complemento es por día: un día bueno no compensa uno malo', () => {
        const good = dayPay({ buckets: 80, hours: 9.5, pieceRate: 6.5, minWage: 23.95 }); // 520, sin top-up
        const bad = dayPay({ buckets: 10, hours: 9.5, pieceRate: 6.5, minWage: 23.95 });  // 65 + 162.53
        const weekTopUp = good.topUp + bad.topUp;
        expect(weekTopUp).toBe(162.53);
        // Si se agregara la semana, el complemento sería 0 (585 ≥ 455.05): eso NO es lo que se paga.
        const aggregated = dayPay({ buckets: 90, hours: 19, pieceRate: 6.5, minWage: 23.95 });
        expect(aggregated.topUp).toBe(0);
    });
});

describe('isNZPublicHoliday', () => {
    it('reconoce festivos y días normales', () => {
        expect(isNZPublicHoliday('2026-10-26')).toBe(true);
        expect(isNZPublicHoliday('2026-10-27')).toBe(false);
    });
});

describe('nzDateOf', () => {
    it('usa la fecha de Nueva Zelanda, no la UTC', () => {
        // 18:30 UTC del día 10 = 07:30 NZDT del día 11
        expect(nzDateOf('2026-10-10T18:30:00Z')).toBe('2026-10-11');
    });
});

describe('payWeekOf', () => {
    it('domingo pertenece a la semana que empezó el lunes anterior', () => {
        expect(payWeekOf('2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11', closesOn: '2026-10-12' });
    });

    it('el lunes abre una semana nueva', () => {
        expect(payWeekOf('2026-10-12')).toEqual({ start: '2026-10-12', end: '2026-10-18', closesOn: '2026-10-19' });
    });

    it('cruza de mes y de año', () => {
        expect(payWeekOf('2027-01-01').start).toBe('2026-12-28');
    });
});

describe('payForRange', () => {
    const d1 = '2026-10-05', d2 = '2026-10-06';
    const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;

    it('suma el complemento día a día', () => {
        const attendance = [
            { pickerId: 'p1', date: d1, checkIn: t(d1, '07:00'), checkOut: t(d1, '17:00') },
            { pickerId: 'p1', date: d2, checkIn: t(d2, '07:00'), checkOut: t(d2, '17:00') },
        ];
        // Día 1: 80 cubetas (520, sin complemento). Día 2: 10 cubetas (65 + 162.53).
        const buckets = [
            ...Array.from({ length: 80 }, () => ({ pickerId: 'p1', scannedAt: t(d1, '10:00') })),
            ...Array.from({ length: 10 }, () => ({ pickerId: 'p1', scannedAt: t(d2, '10:00') })),
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95 });
        expect(r.buckets).toBe(90);
        expect(r.hours).toBe(19);
        expect(r.topUp).toBe(162.53);
        expect(r.total).toBe(747.53);
        expect(r.days).toBe(2);
        expect(r.daysBelowMinimum).toBe(1);
        expect(r.estimatedDays).toBe(0);
    });

    it('asigna las cubetas al día NZ aunque en UTC sea el día anterior', () => {
        const attendance = [{ pickerId: 'p1', date: d2, checkIn: t(d2, '07:00'), checkOut: t(d2, '11:00') }];
        const buckets = [{ pickerId: 'p1', scannedAt: '2026-10-05T19:30:00Z' }]; // 08:30 NZDT del día 6
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95 });
        expect(r.days).toBe(1);
        expect(r.buckets).toBe(1);
    });

    it('excluye rechazos y marca días estimados', () => {
        const buckets = [
            { pickerId: 'p1', scannedAt: t(d1, '08:00') },
            { pickerId: 'p1', scannedAt: t(d1, '09:00'), qualityGrade: 'reject' },
            { pickerId: 'p1', scannedAt: t(d1, '10:00') },
        ];
        const [r] = payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: 23.95 });
        expect(r.buckets).toBe(2);
        expect(r.estimatedDays).toBe(1);
    });

    it('aplica festivo por día', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00'), checkOut: t(d1, '09:00') }];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, isPublicHoliday: d => d === d1 });
        expect(r.topUp).toBe(71.85);
    });

    it('turno abierto de un día pasado: de la entrada al último escaneo, no hasta hoy', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00') }];
        const buckets = [
            { pickerId: 'p1', scannedAt: t(d1, '09:00') },
            { pickerId: 'p1', scannedAt: t(d1, '15:00') },
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95, now: new Date(t(d2, '12:00')) });
        expect(r.hours).toBe(7.5); // 07:00–15:00 = 8 h − 30 min
        expect(r.estimatedDays).toBe(1);
    });

    it('turno abierto de un día pasado sin cubetas: no desaparece, queda a 0 h marcado', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00') }];
        const rows = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now: new Date(t(d2, '12:00')) });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ hours: 0, total: 0, estimatedDays: 1 });
    });

    it('festivos nacionales por defecto (Labour Day 2026-10-26)', () => {
        const day = '2026-10-26';
        const attendance = [{ pickerId: 'p1', date: day, checkIn: t(day, '07:00'), checkOut: t(day, '15:30') }];
        const buckets = Array.from({ length: 10 }, () => ({ pickerId: 'p1', scannedAt: t(day, '10:00') }));
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95 });
        // 8 h × 23.95 × 1.5 = 287.40 − 65 = 222.40
        expect(r.topUp).toBe(222.4);
    });

    it('turno abierto de hoy: cuenta hasta ahora', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00') }];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now: new Date(t(d1, '10:00')) });
        expect(r.hours).toBe(3);
    });
});

describe('rendimiento', () => {
    it('una semana de temporada (14.000 cubetas) se calcula en menos de medio segundo', () => {
        const buckets = Array.from({ length: 14000 }, (_, i) => ({
            pickerId: 'p' + (i % 60),
            scannedAt: new Date(Date.UTC(2026, 9, 4, 19) + i * 40_000).toISOString(),
        }));
        const start = performance.now();
        payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: 23.95 });
        expect(performance.now() - start).toBeLessThan(500);
    });
});
