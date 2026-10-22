/**
 * calculate-payroll (computePayroll) con un Supabase en memoria: fallos
 * encontrados por la prueba diferencial, con cifras hechas a mano.
 */
import { describe, it, expect, vi } from 'vitest';
import { computePayroll } from '../../../supabase/functions/_shared/payroll-calc.ts';
import { fakeSupabase } from './fakeSupabase';

const nz = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+13:00`).toISOString();

function tables(extra: { attendance: object[]; buckets: object[]; contracts?: object[]; pieceRates?: object[] }) {
    return {
        harvest_settings: [{ orchard_id: 'o1', piece_rate: 6.5, min_wage_rate: 23.95 }],
        piece_rates: (extra.pieceRates ?? []).map((r, i) => ({ id: `pr-${i}`, variety: null, orchard_id: 'o1', ...r })),
        daily_attendance: extra.attendance.map((a, i) => ({ id: i, deleted_at: null, break_start: null, break_minutes: null, orchard_id: 'o1', ...a })),
        bucket_records: extra.buckets.map((b, i) => ({ id: i, deleted_at: null, quality_grade: 'A', variety: null, orchard_id: 'o1', ...b })),
        contracts: extra.contracts ?? [],
        pickers: [{ id: 'p1', name: 'Ana' }],
    };
}

describe('computePayroll — turnos que cruzan la medianoche en el borde de la semana', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    it('domingo 20:00 → lunes 02:00: las cubetas de después de medianoche son del domingo (antes se perdían de la semana)', async () => {
        // Semana 2026-10-12 (lun) → 2026-10-18 (dom). 10 cubetas a las 21:00 y 10 a la 01:00 del lunes.
        const buckets = [
            ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', scanned_at: nz('2026-10-18', '21:00') })),
            ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', scanned_at: nz('2026-10-19', '01:00') })),
        ];
        const attendance = [{ picker_id: 'p1', date: '2026-10-18', check_in: nz('2026-10-18', '20:00'), check_out: nz('2026-10-19', '02:00'), break_start: nz('2026-10-18', '23:00') }];
        const db = fakeSupabase(tables({ attendance, buckets }));
        const week = await computePayroll(db, { start_date: '2026-10-12', end_date: '2026-10-18' });
        const [p] = week.picker_breakdown;
        // 6 h − 30 min anotados = 5.5 h; 20 × 6.50 = 130.00; mínimo 131.725 → complemento 1.73
        expect([p.buckets, p.hours_worked, p.piece_rate_earnings, p.top_up_required, p.total_earnings]).toEqual([20, 5.5, 130, 1.73, 131.73]);

        // La semana siguiente no vuelve a pagar esas cubetas ni inventa horas el lunes
        const next = await computePayroll(db, { start_date: '2026-10-19', end_date: '2026-10-25' });
        expect(next.picker_breakdown).toEqual([]);
    });
});

describe('computePayroll — tarifa de contrato', () => {
    const attendance = [{ picker_id: 'p1', date: '2026-10-14', check_in: nz('2026-10-14', '08:00'), check_out: nz('2026-10-14', '12:00') }];
    const contract = { employee_id: 'p1', hourly_rate: 30, start_date: '2026-01-01', end_date: null, status: 'active' };

    it('un contrato activo a 30 $/h sube el mínimo de esa persona (4 h × 30 = 120)', async () => {
        const r = await computePayroll(fakeSupabase(tables({ attendance, buckets: [], contracts: [{ ...contract, deleted_at: null }] })), { start_date: '2026-10-12', end_date: '2026-10-18' });
        expect(r.picker_breakdown[0].total_earnings).toBe(120);
    });

    it('un contrato BORRADO (deleted_at) ya no cuenta: 4 h × 23.95 = 95.80 (antes 120)', async () => {
        const r = await computePayroll(fakeSupabase(tables({ attendance, buckets: [], contracts: [{ ...contract, deleted_at: '2026-10-01T00:00:00Z' }] })), { start_date: '2026-10-12', end_date: '2026-10-18' });
        expect(r.picker_breakdown[0].total_earnings).toBe(95.8);
    });
});

describe('computePayroll — casos del borde de la semana y festivos', () => {
    it('cubeta del lunes 00:10 cubierta por el turno del lunes (y por el del domingo, solapado): es del lunes, fuera de la semana', async () => {
        const attendance = [
            { picker_id: 'p1', date: '2026-10-18', check_in: nz('2026-10-18', '22:00'), check_out: nz('2026-10-19', '00:15') },
            { picker_id: 'p1', date: '2026-10-19', check_in: nz('2026-10-19', '00:05'), check_out: nz('2026-10-19', '00:30') },
        ];
        const buckets = [{ picker_id: 'p1', scanned_at: nz('2026-10-19', '00:10') }];
        const r = await computePayroll(fakeSupabase(tables({ attendance, buckets })), { start_date: '2026-10-12', end_date: '2026-10-18' });
        expect(r.picker_breakdown[0].buckets).toBe(0);
    });

    it('turno sin cerrar en festivo y sin cubetas (0 h, revisar): no genera día alternativo', async () => {
        // 26-oct-2026 = Labour Day
        const attendance = [{ picker_id: 'p1', date: '2026-10-26', check_in: nz('2026-10-26', '08:00'), check_out: null }];
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
        const r = await computePayroll(fakeSupabase(tables({ attendance, buckets: [] })), { start_date: '2026-10-26', end_date: '2026-11-01' })
            .finally(() => vi.useRealTimers());
        expect(r.picker_breakdown[0].estimated_days).toBe(1);
        expect(r.picker_breakdown[0].alternative_holidays_owed).toBe(0);
        expect(r.summary.total_alternative_holidays_owed).toBe(0);
    });
});

// Auditoría 23-10 (A4): subir el precio el miércoles recalculaba toda la semana ($19.403 → $22.474)
describe('computePayroll — precio por cubeta por día, huerto y variedad', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const day = (d: string, n: number, variety: string | null = null) =>
        Array.from({ length: n }, () => ({ picker_id: 'p1', scanned_at: nz(d, '10:00'), variety }));
    // Lunes 6.50 (desde antes de la semana), miércoles 7.25; Braeburn 8.10 desde el jueves
    const pieceRates = [
        { effective_date: '2026-09-01', piece_rate: 6.5 },
        { effective_date: '2026-10-14', piece_rate: 7.25 },
        { variety: 'Braeburn', effective_date: '2026-10-15', piece_rate: 8.1 },
    ];

    it('un cambio a mitad de semana no reescribe los días anteriores', async () => {
        const buckets = [...day('2026-10-12', 20), ...day('2026-10-13', 20), ...day('2026-10-14', 20), ...day('2026-10-15', 10, 'Braeburn'), ...day('2026-10-15', 10, 'Fuji')];
        const r = await computePayroll(fakeSupabase(tables({ attendance: [], buckets, pieceRates })), { start_date: '2026-10-12', end_date: '2026-10-18' });
        const pay = Object.fromEntries(r.picker_breakdown[0].days.map(d => [d.date, d.pieceEarnings]));
        expect(pay).toMatchObject({ '2026-10-12': 130, '2026-10-13': 130, '2026-10-14': 145, '2026-10-15': 153.5 }); // 10 × 8.10 + 10 × 7.25
        expect(r.picker_breakdown[0].piece_rate_earnings).toBe(558.5);
    });

    it('el precio de antes del rango viene de piece_rates_as_of (el último fijado antes del lunes)', async () => {
        const r = await computePayroll(fakeSupabase(tables({ attendance: [], buckets: day('2026-10-19', 10), pieceRates })), { start_date: '2026-10-19', end_date: '2026-10-25' });
        expect(r.picker_breakdown[0].piece_rate_earnings).toBe(72.5); // 10 × 7.25
    });

    it('sin precios por día: harvest_settings.piece_rate', async () => {
        const r = await computePayroll(fakeSupabase(tables({ attendance: [], buckets: day('2026-10-19', 10) })), { start_date: '2026-10-19', end_date: '2026-10-25' });
        expect(r.picker_breakdown[0].piece_rate_earnings).toBe(65);
    });
});
