import { describe, it, expect } from 'vitest';
import { shiftHours, dayPay, nzDateOf, payWeekOf, payForRange, isNZPublicHoliday, PAY_RULES, pieceRateOn, mealBreakMissing, type DailyPieceRate } from './pay';

// Fechas en NZDT (UTC+13) — 11 oct 2026
const at = (hhmm: string) => `2026-10-11T${hhmm}:00+13:00`;

describe('shiftHours', () => {
    // Decisión del dueño (2026-10-14): solo se descuenta el descanso ANOTADO
    it('jornada completa sin descanso anotado: NO descuenta nada (se avisa al team leader)', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00') });
        expect(r).toEqual({ hours: 10, grossHours: 10, breakMinutes: 0, source: 'timesheet' });
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

    it('descanso anotado fuera de un turno largo (error al anotar): no se descuenta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('16:00'), breakStart: '2026-10-10T12:00:00+13:00' });
        expect(r.hours).toBe(9);
        expect(r.breakMinutes).toBe(0);
    });

    it('turno corto (≤ 4 h) sin descanso anotado: no descuenta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('10:00') });
        expect(r.hours).toBe(3);
        expect(r.breakMinutes).toBe(0);
    });

    it('respeta una duración de descanso distinta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), breakStart: at('12:00'), breakMinutes: 45 });
        expect(r.hours).toBe(9.25);
    });

    it('una duración de descanso sin hora anotada no descuenta', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), breakMinutes: 45 });
        expect(r.hours).toBe(10);
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

    it('sin fichaje: estima por primer y último escaneo (sin descanso anotado, sin descontar)', () => {
        const r = shiftHours({ scanTimes: [at('08:00'), at('13:30'), null, at('15:00')] });
        expect(r.source).toBe('scan_estimate');
        expect(r.grossHours).toBe(7);
        expect(r.hours).toBe(7);
    });

    it('el fichaje manda sobre los escaneos', () => {
        const r = shiftHours({ checkIn: at('07:00'), checkOut: at('17:00'), breakStart: at('12:00'), scanTimes: [at('09:00'), at('10:00')] });
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

describe('total = cubetas + complemento, al céntimo', () => {
    it('en miles de combinaciones el total es la suma exacta de sus partes', () => {
        for (let buckets = 0; buckets < 60; buckets++) {
            for (let mins = 0; mins < 600; mins += 7) {
                const p = dayPay({ buckets, hours: Math.round(mins / 60 * 100) / 100, pieceRate: 6.55, minWage: 23.95 });
                expect(Math.round((p.pieceEarnings + p.topUp) * 100)).toBe(Math.round(p.total * 100));
            }
        }
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
            { pickerId: 'p1', date: d1, checkIn: t(d1, '07:00'), checkOut: t(d1, '17:00'), breakStart: t(d1, '12:00') },
            { pickerId: 'p1', date: d2, checkIn: t(d2, '07:00'), checkOut: t(d2, '17:00'), breakStart: t(d2, '12:00') },
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
        expect(r.hours).toBe(8); // 07:00–15:00, sin descanso anotado (no se descuenta)
        expect(r.estimatedDays).toBe(1);
    });

    it('turno abierto de un día pasado: empieza en la entrada aunque haya escaneos antes', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:20') }];
        const buckets = [
            { pickerId: 'p1', scannedAt: t(d1, '07:16') },
            { pickerId: 'p1', scannedAt: t(d1, '15:20') },
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95, now: new Date(t(d2, '12:00')) });
        expect(r.hours).toBe(8); // 07:20–15:20
    });

    it('turno abierto de un día pasado sin cubetas: no desaparece, queda a 0 h marcado', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00') }];
        const rows = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now: new Date(t(d2, '12:00')) });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ hours: 0, total: 0, estimatedDays: 1 });
    });

    it('festivos nacionales por defecto (Labour Day 2026-10-26)', () => {
        const day = '2026-10-26';
        const attendance = [{ pickerId: 'p1', date: day, checkIn: t(day, '07:00'), checkOut: t(day, '15:30'), breakStart: t(day, '12:00') }];
        const buckets = Array.from({ length: 10 }, () => ({ pickerId: 'p1', scannedAt: t(day, '10:00') }));
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95 });
        // Mínimo 8 h × 23.95 × 1.5 = 287.40. Cubetas 65 + plus de festivo 32.50
        // (tiempo y medio también sobre las cubetas) → complemento 189.90
        expect(r.holidayPremium).toBe(32.5);
        expect(r.topUp).toBe(189.9);
        expect(r.total).toBe(287.4);
    });

    it('turno abierto de hoy: cuenta hasta ahora', () => {
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t(d1, '07:00') }];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now: new Date(t(d1, '10:00')) });
        expect(r.hours).toBe(3);
    });
});

describe('rendimiento', () => {
    // Con mutation testing (STRYKER_TESTS) el codigo va instrumentado: el tiempo no significa nada
    it.skipIf(!!process.env.STRYKER_TESTS)('una semana de temporada (14.000 cubetas) se calcula en menos de medio segundo', () => {
        const buckets = Array.from({ length: 14000 }, (_, i) => ({
            pickerId: 'p' + (i % 60),
            scannedAt: new Date(Date.UTC(2026, 9, 4, 19) + i * 40_000).toISOString(),
        }));
        const start = performance.now();
        payForRange({ attendance: [], buckets, pieceRate: 6.5, minWage: 23.95 });
        expect(performance.now() - start).toBeLessThan(500);
    });
});

describe('payForRange — varios tramos y variedades', () => {
    const d1 = '2026-10-05';
    const t = (hhmm: string) => `${d1}T${hhmm}:00+13:00`;
    const now = new Date('2026-10-07T12:00:00+13:00');

    it('dos huertos el mismo día: suma tramos y trayecto, descanso una vez, complemento del día entero', () => {
        const attendance = [
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('07:00'), checkOut: t('11:00'), breakStart: t('10:00') },
            { pickerId: 'p1', date: d1, orchardId: 'B', checkIn: t('11:30'), checkOut: t('16:30') },
        ];
        // Mañana en A: 20 cubetas Royal Gala a 6.50. Tarde en B: 10 Braeburn a 8.00.
        const buckets = [
            ...Array.from({ length: 20 }, () => ({ pickerId: 'p1', scannedAt: t('09:00'), orchardId: 'A', variety: 'Royal Gala', pieceRate: 6.5 })),
            ...Array.from({ length: 10 }, () => ({ pickerId: 'p1', scannedAt: t('13:00'), orchardId: 'B', variety: 'Braeburn', pieceRate: 8 })),
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95, now });
        // 4 h + 30 min de trayecto + 5 h = 9.5 h brutas − 30 min = 9 h
        expect(r.hours).toBe(9);
        expect(r.days).toBe(1);
        expect(r.pieceEarnings).toBe(210); // 130 + 80
        // Mínimo del día: 9 × 23.95 = 215.55 → complemento 5.55
        expect(r.topUp).toBe(5.55);
        expect(r.total).toBe(215.55);
        const day = r.dayDetails[0];
        expect(day.segments.map(s => s.orchardId)).toEqual(['A', 'B']);
        expect(day.bucketsByVariety).toEqual({ 'Royal Gala': 20, Braeburn: 10 });
        expect(day.breakMinutes).toBe(30);
        expect(day.travelMinutes).toBe(30);
        // El trayecto se reparte: 15 min a cada huerto
        expect(day.segments.map(s => s.travelHours)).toEqual([0.25, 0.25]);
        expect(day.estimated).toBe(false);
    });

    it('el complemento se calcula con el día completo, no por huerto', () => {
        // En A gana mucho y en B poco: por día completo no hay complemento.
        const attendance = [
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('07:00'), checkOut: t('11:00') },
            { pickerId: 'p1', date: d1, orchardId: 'B', checkIn: t('11:30'), checkOut: t('15:30'), breakStart: t('13:00') },
        ];
        const buckets = [
            ...Array.from({ length: 30 }, () => ({ pickerId: 'p1', scannedAt: t('09:00'), orchardId: 'A', pieceRate: 6.5 })),
            { pickerId: 'p1', scannedAt: t('12:00'), orchardId: 'B', pieceRate: 6.5 },
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95, now });
        // (8 h + 0.5 trayecto − 0.5) × 23.95 = 191.6 < 31 × 6.5 = 201.5
        expect(r.topUp).toBe(0);
    });

    it('descanso anotado en el segundo tramo se descuenta una sola vez', () => {
        const attendance = [
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('07:00'), checkOut: t('10:00') },
            { pickerId: 'p1', date: d1, orchardId: 'B', checkIn: t('10:30'), checkOut: t('15:30'), breakStart: t('12:00'), breakMinutes: 30 },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now });
        // 3 h + 30 min de trayecto + 5 h − 30 min de descanso
        expect(r.hours).toBe(8);
    });

    it('cubeta sin precio propio usa el general', () => {
        const buckets = [
            { pickerId: 'p1', scannedAt: t('09:00'), pieceRate: 10 },
            { pickerId: 'p1', scannedAt: t('10:00') },
        ];
        const attendance = [{ pickerId: 'p1', date: d1, checkIn: t('08:00'), checkOut: t('10:00') }];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 1, now });
        expect(r.pieceEarnings).toBe(16.5);
    });
});

describe('payForRange — trayecto', () => {
    const d1 = '2026-10-05';
    const t = (hhmm: string) => `${d1}T${hhmm}:00+13:00`;
    it('salir y volver al MISMO huerto no paga el hueco', () => {
        const attendance = [
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('07:00'), checkOut: t('10:00') },
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('12:00'), checkOut: t('14:00') },
        ];
        const [r] = payForRange({ attendance, buckets: [], pieceRate: 6.5, minWage: 23.95, now: new Date('2026-10-07T12:00:00+13:00') });
        expect(r.dayDetails[0].travelMinutes).toBe(0);
        expect(r.hours).toBe(5); // 3 h + 2 h (sin descanso anotado: no se descuenta)
    });
});

// Decisión del dueño (2026-10-23): el precio vive por (huerto, variedad, día)
describe('pieceRateOn — precio por día, huerto y variedad', () => {
    const rates: DailyPieceRate[] = [
        { orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 6.5 },
        { orchardId: 'A', variety: null, effectiveDate: '2026-10-07', pieceRate: 7.25 },
        { orchardId: 'A', variety: 'Braeburn', effectiveDate: '2026-10-05', pieceRate: 8.1 },
        { orchardId: 'A', variety: 'Braeburn', effectiveDate: '2026-10-08', pieceRate: 8.5 },
        { orchardId: 'B', variety: null, effectiveDate: '2026-10-01', pieceRate: 6 },
        { orchardId: 'B', variety: 'braeburn', effectiveDate: '2026-10-01', pieceRate: 7 },
    ];

    it('un cambio a mitad de semana no toca los días anteriores', () => {
        expect(pieceRateOn(rates, 'A', null, '2026-10-05', 5)).toBe(6.5);
        expect(pieceRateOn(rates, 'A', null, '2026-10-06', 5)).toBe(6.5);
        expect(pieceRateOn(rates, 'A', null, '2026-10-07', 5)).toBe(7.25);
    });

    it('si nadie lo cambia, vale el último precio fijado', () => {
        expect(pieceRateOn(rates, 'A', null, '2026-10-20', 5)).toBe(7.25);
        expect(pieceRateOn(rates, 'A', 'Braeburn', '2026-12-01', 5)).toBe(8.5);
    });

    it('cada variedad tiene su precio por día', () => {
        expect(pieceRateOn(rates, 'A', 'Braeburn', '2026-10-05', 5)).toBe(8.1);
        expect(pieceRateOn(rates, 'A', 'Braeburn', '2026-10-07', 5)).toBe(8.1);
        expect(pieceRateOn(rates, 'A', 'Braeburn', '2026-10-08', 5)).toBe(8.5);
    });

    it('variedad sin precio (o antes de su primer precio) usa la general del huerto ese día', () => {
        expect(pieceRateOn(rates, 'A', 'Fuji', '2026-10-06', 5)).toBe(6.5);
        expect(pieceRateOn(rates, 'A', 'Fuji', '2026-10-07', 5)).toBe(7.25);
        expect(pieceRateOn(rates, 'A', 'Braeburn', '2026-10-04', 5)).toBe(6.5);
        expect(pieceRateOn(rates, 'A', '   ', '2026-10-07', 5)).toBe(7.25);
        expect(pieceRateOn(rates, 'A', null, '2026-10-07', 5)).toBe(7.25);
    });

    it('dos huertos: el precio de uno no se usa en el otro', () => {
        expect(pieceRateOn(rates, 'B', 'Braeburn', '2026-10-08', 5)).toBe(7);
        expect(pieceRateOn(rates, 'B', null, '2026-10-08', 5)).toBe(6);
        expect(pieceRateOn(rates, 'B', 'Fuji', '2026-10-08', 5)).toBe(6);
    });

    it('variedad sin distinguir mayúsculas ni espacios', () => {
        expect(pieceRateOn(rates, 'A', ' BRAEBURN ', '2026-10-08', 5)).toBe(8.5);
        expect(pieceRateOn(rates, 'B', 'Braeburn', '2026-10-01', 5)).toBe(7);
    });

    it('sin precios, sin huerto o antes del primer precio: fallback', () => {
        expect(pieceRateOn(rates, 'A', null, '2026-09-30', 5)).toBe(5);
        expect(pieceRateOn(rates, 'C', 'Braeburn', '2026-10-08', 5)).toBe(5);
        expect(pieceRateOn(rates, null, 'Braeburn', '2026-10-08', 5)).toBe(5);
        expect(pieceRateOn([], 'A', null, '2026-10-08', 5)).toBe(5);
    });

    it('acepta la fecha con hora y respeta un precio 0', () => {
        expect(pieceRateOn(rates, 'A', null, '2026-10-07T23:59:00', 5)).toBe(7.25);
        expect(pieceRateOn([{ orchardId: 'Z', variety: null, effectiveDate: '2026-01-01', pieceRate: 0 }], 'Z', 'Envy', '2026-10-01', 5)).toBe(0);
    });

    it('el orden de las filas no importa', () => {
        const shuffled = [...rates].reverse();
        expect(pieceRateOn(shuffled, 'A', null, '2026-10-06', 5)).toBe(6.5);
        expect(pieceRateOn(shuffled, 'A', 'Braeburn', '2026-10-07', 5)).toBe(8.1);
    });

    it('semana con cambio el miércoles: el pago del lunes y martes no cambia', () => {
        const at = (d: string) => `${d}T10:00:00+13:00`;
        const bucketsOf = (d: string, n: number, variety: string | null = null) =>
            Array.from({ length: n }, () => ({
                pickerId: 'p1', scannedAt: at(d), orchardId: 'A', variety,
                pieceRate: pieceRateOn(rates, 'A', variety, nzDateOf(at(d)), 5),
            }));
        const buckets = [...bucketsOf('2026-10-05', 20), ...bucketsOf('2026-10-06', 20), ...bucketsOf('2026-10-07', 20), ...bucketsOf('2026-10-08', 10, 'Braeburn')];
        const [r] = payForRange({ attendance: [], buckets, pieceRate: 5, minWage: 23.95, now: new Date('2026-10-12T12:00:00+13:00') });
        const byDate = Object.fromEntries(r.dayDetails.map(d => [d.date, d.pieceEarnings]));
        expect(byDate['2026-10-05']).toBe(130);   // 20 × 6.50
        expect(byDate['2026-10-06']).toBe(130);   // 20 × 6.50
        expect(byDate['2026-10-07']).toBe(145);   // 20 × 7.25 (desde el miércoles)
        expect(byDate['2026-10-08']).toBe(85);    // 10 × 8.50 Braeburn
    });
});

describe('payForRange — líneas por variedad y reparto por huerto', () => {
    const d1 = '2026-10-05';
    const t = (hhmm: string) => `${d1}T${hhmm}:00+13:00`;
    const now = new Date('2026-10-07T12:00:00+13:00');
    it('reparte horas, cubetas y complemento entre huertos y cuadra con el total', () => {
        const attendance = [
            { pickerId: 'p1', date: d1, orchardId: 'A', checkIn: t('07:00'), checkOut: t('11:00') },
            { pickerId: 'p1', date: d1, orchardId: 'B', checkIn: t('11:30'), checkOut: t('15:30') },
        ];
        const buckets = [
            ...Array.from({ length: 5 }, () => ({ pickerId: 'p1', scannedAt: t('09:00'), orchardId: 'A', variety: 'Royal Gala', pieceRate: 6.5 })),
            ...Array.from({ length: 3 }, () => ({ pickerId: 'p1', scannedAt: t('12:00'), orchardId: 'B', variety: 'Braeburn', pieceRate: 8 })),
        ];
        const [r] = payForRange({ attendance, buckets, pieceRate: 6.5, minWage: 23.95, now });
        const day = r.dayDetails[0];
        expect(day.pieceLines).toEqual([
            { variety: 'Braeburn', rate: 8, buckets: 3, earnings: 24 },
            { variety: 'Royal Gala', rate: 6.5, buckets: 5, earnings: 32.5 },
        ]);
        // 4 h + 15 min de trayecto en cada huerto: mitad y mitad
        const [a, b] = day.byOrchard;
        expect(a.orchardId).toBe('A');
        expect(a.hours + b.hours).toBeCloseTo(day.hours, 2);
        expect(a.hours).toBeCloseTo(b.hours, 2);
        expect(a.pieceEarnings).toBe(32.5);
        expect(b.pieceEarnings).toBe(24);
        expect(Math.round((a.total + b.total) * 100) / 100).toBe(day.total);
    });
});

describe('festivo: tiempo y medio también sobre las cubetas (Holidays Act s.50)', () => {
    it('cubetas por encima del mínimo: cobra 1.5× lo de las cubetas', () => {
        const p = dayPay({ buckets: 0, pieceEarnings: 300, hours: 8, pieceRate: 6.5, minWage: 23.95, isPublicHoliday: true });
        expect(p.pieceEarnings).toBe(300);
        expect(p.holidayPremium).toBe(150);
        expect(p.topUp).toBe(0);
        expect(p.total).toBe(450);
        expect(p.belowMinimum).toBe(false);
    });

    it('cubetas por debajo: el mínimo ×1.5 manda, el complemento cubre la diferencia', () => {
        const p = dayPay({ buckets: 0, pieceEarnings: 100, hours: 8, pieceRate: 6.5, minWage: 23.95, isPublicHoliday: true });
        // mínimo 8 × 23.95 × 1.5 = 287.40; cubetas 100 + plus 50 → complemento 137.40
        expect(p.holidayPremium).toBe(50);
        expect(p.topUp).toBe(137.4);
        expect(p.total).toBe(287.4);
        expect(p.belowMinimum).toBe(true);
    });

    it('día normal: sin plus', () => {
        const p = dayPay({ buckets: 0, pieceEarnings: 300, hours: 8, pieceRate: 6.5, minWage: 23.95, isPublicHoliday: false });
        expect(p.holidayPremium).toBe(0);
        expect(p.total).toBe(300);
    });
});

describe('mealBreakMissing (aviso al team leader)', () => {
    it('más de 4 h sin descanso anotado: falta', () => {
        expect(mealBreakMissing([{ checkIn: at('07:00'), checkOut: at('11:01') }])).toBe(true);
    });
    it('exactamente 4 h: no hace falta (ERA Parte 6D: MÁS de 4 h)', () => {
        expect(mealBreakMissing([{ checkIn: at('07:00'), checkOut: at('11:00') }])).toBe(false);
    });
    it('descanso anotado dentro del turno: no falta', () => {
        expect(mealBreakMissing([{ checkIn: at('07:00'), checkOut: at('17:00'), breakStart: at('12:00') }])).toBe(false);
    });
    it('descanso anotado fuera del turno (error): sigue faltando', () => {
        expect(mealBreakMissing([{ checkIn: at('07:00'), checkOut: at('17:00'), breakStart: at('18:00') }])).toBe(true);
    });
    it('turno abierto: cuenta hasta ahora', () => {
        expect(mealBreakMissing([{ checkIn: at('07:00') }], new Date(at('10:30')))).toBe(false);
        expect(mealBreakMissing([{ checkIn: at('07:00') }], new Date(at('11:30')))).toBe(true);
    });
    it('dos tramos del día suman; un descanso en cualquiera vale', () => {
        const a = { checkIn: at('07:00'), checkOut: at('09:30') };
        const b = { checkIn: at('10:00'), checkOut: at('12:00') };
        expect(mealBreakMissing([a, b])).toBe(true);
        expect(mealBreakMissing([a, { ...b, breakStart: at('11:00') }])).toBe(false);
    });
});
