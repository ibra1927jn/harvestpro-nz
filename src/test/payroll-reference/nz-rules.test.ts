/**
 * Nómina contra las reglas de Nueva Zelanda (Fase 2 de docs/PLAN_NIVEL.md).
 * Cifras hechas a mano, con el cálculo de la Edge Function (computePayroll)
 * sobre un Supabase en memoria y, donde toca, con el cálculo de la app.
 *
 * - Salario mínimo por fecha (Minimum Wage Order de cada año, desde el 1 de
 *   abril): cada día se paga con el mínimo legal de ESE día.
 * - Festivo trabajado: tiempo y medio (Holidays Act 2003 s.50), también sobre
 *   lo ganado por cubetas.
 * - Día alternativo por festivo trabajado (Holidays Act 2003 s.56/s.60).
 * - KiwiSaver, PAYE y el 8 % de holiday pay de los casuales los hace el programa
 *   de nóminas (decisión del dueño, 2026-10-16): HarvestPro calcula y exporta el
 *   BRUTO y no descuenta ni añade nada de eso.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { computePayroll, type PickerBreakdown } from '../../../supabase/functions/_shared/payroll-calc.ts';
import { NZ_MIN_WAGE_HISTORY, minWageFloorOn, isNZPublicHoliday, payForRange } from '@/services/harvestMetrics/pay';
import { generatePaySauceCSV, generateXeroCSV } from '@/services/export-payroll-formats.service';
import type { PayrollExportData } from '@/services/export.service';
import { NZ_KIWISAVER_EMPLOYER_MIN, NZ_KIWISAVER_RATES } from '@/constants/nz-law';
import { fakeSupabase } from './fakeSupabase';

/** Hora NZ con el desfase de ese día (NZDT +13 hasta el 5 de abril y desde el 27 de septiembre de 2026) */
const nz = (date: string, hhmm: string, offset = '+13:00') => new Date(`${date}T${hhmm}:00${offset}`).toISOString();

interface Shift { picker_id?: string; orchard_id?: string; date: string; from: string; to: string; breakAt?: string; offset?: string }

function db(opts: {
    shifts?: Shift[];
    buckets?: { picker_id?: string; orchard_id?: string; at: string }[];
    minWage?: number;
    contracts?: object[];
}) {
    return fakeSupabase({
        harvest_settings: [
            { orchard_id: 'o1', piece_rate: 6.5, min_wage_rate: opts.minWage ?? 23.95 },
            { orchard_id: 'o2', piece_rate: 6.5, min_wage_rate: opts.minWage ?? 23.95 },
        ],
        piece_rates: [],
        daily_attendance: (opts.shifts ?? []).map((s, i) => ({
            id: i, deleted_at: null, break_minutes: null, corrected_at: null,
            picker_id: s.picker_id ?? 'p1', orchard_id: s.orchard_id ?? 'o1', date: s.date,
            check_in: nz(s.date, s.from, s.offset), check_out: nz(s.date, s.to, s.offset),
            break_start: s.breakAt ? nz(s.date, s.breakAt, s.offset) : null,
        })),
        bucket_records: (opts.buckets ?? []).map((b, i) => ({
            id: i, deleted_at: null, quality_grade: 'A', variety: null,
            picker_id: b.picker_id ?? 'p1', orchard_id: b.orchard_id ?? 'o1', scanned_at: b.at,
        })),
        contracts: opts.contracts ?? [],
        pickers: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bo' }],
    });
}

/** n cubetas repartidas entre dos horas NZ del mismo día */
const bucketsBetween = (date: string, from: string, to: string, n: number, picker_id = 'p1', orchard_id = 'o1') => {
    const a = Date.parse(nz(date, from)), b = Date.parse(nz(date, to));
    return Array.from({ length: n }, (_, i) => ({ picker_id, orchard_id, at: new Date(a + ((b - a) * i) / Math.max(1, n - 1)).toISOString() }));
};

const dayTotals = (p: PickerBreakdown) => Object.fromEntries(p.days.map(d => [d.date, d.total]));

beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// ── Salario mínimo por fecha ────────────────────────────────────────────────
describe('minimum wage by date (Minimum Wage Order, from 1 April each year)', () => {
    it('the history holds the adult minimum of each Order', () => {
        expect(NZ_MIN_WAGE_HISTORY.map(r => [r.from, r.rate])).toEqual([
            ['2023-04-01', 22.7],
            ['2024-04-01', 23.15],
            ['2025-04-01', 23.5],
            ['2026-04-01', 23.95],
        ]);
    });

    it('each rate starts exactly on its 1 April, not the day before', () => {
        for (let i = 1; i < NZ_MIN_WAGE_HISTORY.length; i++) {
            const { from, rate } = NZ_MIN_WAGE_HISTORY[i];
            const dayBefore = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
            expect(minWageFloorOn(dayBefore)).toBe(NZ_MIN_WAGE_HISTORY[i - 1].rate);
            expect(minWageFloorOn(from)).toBe(rate);
        }
    });

    // Semana lunes 30-mar → domingo 5-abr-2026; 4 h al día, sin cubetas.
    // La empresa tenía configurado el mínimo de entonces (23.50).
    const week = { start_date: '2026-03-30', end_date: '2026-04-05' };
    const fourHours = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02'].map(date => ({ date, from: '08:00', to: '12:00' }));

    it('a pay week that crosses 1 April pays each day at the minimum of that day', async () => {
        const r = await computePayroll(db({ shifts: fourHours, minWage: 23.5 }), week);
        const [p] = r.picker_breakdown;
        // 4 × 23.50 = 94.00 en marzo; 4 × 23.95 = 95.80 desde el 1 de abril
        expect(dayTotals(p)).toEqual({ '2026-03-30': 94, '2026-03-31': 94, '2026-04-01': 95.8, '2026-04-02': 95.8 });
        expect(p.total_earnings).toBe(379.6);
        expect(p.minimum_required).toBe(379.6);
    });

    it('a contract rate between the old and the new minimum still counts before 1 April', async () => {
        const contracts = [{ employee_id: 'p1', hourly_rate: 23.8, start_date: '2026-01-01', end_date: null, status: 'active', deleted_at: null }];
        const r = await computePayroll(db({ shifts: fourHours, minWage: 23.5, contracts }), week);
        // 4 × 23.80 = 95.20 en marzo (su contrato); desde el 1 de abril manda el legal: 95.80
        expect(dayTotals(r.picker_breakdown[0])).toEqual({ '2026-03-30': 95.2, '2026-03-31': 95.2, '2026-04-01': 95.8, '2026-04-02': 95.8 });
    });

    it('a company minimum above the legal one is paid every day', async () => {
        const r = await computePayroll(db({ shifts: fourHours, minWage: 25 }), week);
        expect(dayTotals(r.picker_breakdown[0])).toEqual({ '2026-03-30': 100, '2026-03-31': 100, '2026-04-01': 100, '2026-04-02': 100 });
    });

    it('a configured minimum below the legal one is never paid', async () => {
        const r = await computePayroll(db({ shifts: fourHours.slice(2), minWage: 20 }), week);
        expect(r.picker_breakdown[0].total_earnings).toBe(191.6); // 2 × 4 h × 23.95
        expect(r.settings.min_wage_rate).toBe(23.95);
    });

    it('the app calculation gives the same days (payForRange)', () => {
        const [p] = payForRange({
            attendance: fourHours.map(s => ({ pickerId: 'p1', date: s.date, checkIn: nz(s.date, s.from), checkOut: nz(s.date, s.to) })),
            buckets: [], pieceRate: 6.5, minWage: 23.5, now: new Date('2026-04-10T00:00:00Z'),
        });
        expect(Object.fromEntries(p.dayDetails.map(d => [d.date, d.total]))).toEqual({ '2026-03-30': 94, '2026-03-31': 94, '2026-04-01': 95.8, '2026-04-02': 95.8 });
    });
});

// ── Festivo trabajado: tiempo y medio ───────────────────────────────────────
describe('public holiday worked: time and a half (Holidays Act 2003 s.50)', () => {
    // Labour Day 2026 = lunes 26 de octubre; el martes 27 es un día normal
    const week = { start_date: '2026-10-26', end_date: '2026-11-01' };
    const day = (date: string) => ({ date, from: '08:00', to: '16:30', breakAt: '12:00' }); // 8 h pagadas

    it('Labour Day is a public holiday, the next day is not', () => {
        expect(isNZPublicHoliday('2026-10-26')).toBe(true);
        expect(isNZPublicHoliday('2026-10-27')).toBe(false);
    });

    it('low piece earnings: topped up to 1.5 × minimum for the hours', async () => {
        const r = await computePayroll(db({ shifts: [day('2026-10-26')], buckets: bucketsBetween('2026-10-26', '08:10', '16:00', 10) }), week);
        const [p] = r.picker_breakdown;
        // 10 × 6.50 = 65.00; plus festivo 32.50; mínimo 8 × 23.95 × 1.5 = 287.40 → complemento 189.90
        expect([p.piece_rate_earnings, p.holiday_premium, p.top_up_required, p.total_earnings]).toEqual([65, 32.5, 189.9, 287.4]);
        expect([p.hours_holiday, p.hours_ordinary, p.minimum_required]).toEqual([8, 0, 287.4]);
    });

    it('high piece earnings: the buckets are paid at time and a half too', async () => {
        const r = await computePayroll(db({ shifts: [day('2026-10-26')], buckets: bucketsBetween('2026-10-26', '08:10', '16:00', 60) }), week);
        const [p] = r.picker_breakdown;
        // 60 × 6.50 = 390.00 + 195.00 de plus = 585.00 (> 287.40): sin complemento
        expect([p.piece_rate_earnings, p.holiday_premium, p.top_up_required, p.total_earnings]).toEqual([390, 195, 0, 585]);
    });

    it('the same day on an ordinary date: 1 × minimum, no premium', async () => {
        const r = await computePayroll(db({ shifts: [day('2026-10-27')], buckets: bucketsBetween('2026-10-27', '08:10', '16:00', 10) }), week);
        const [p] = r.picker_breakdown;
        // mínimo 8 × 23.95 = 191.60 → complemento 126.60
        expect([p.piece_rate_earnings, p.holiday_premium, p.top_up_required, p.total_earnings]).toEqual([65, 0, 126.6, 191.6]);
        expect([p.hours_holiday, p.hours_ordinary]).toEqual([0, 8]);
    });

    it('a week with both: each day on its own rule (a good day never covers a bad one)', async () => {
        const r = await computePayroll(db({
            shifts: [day('2026-10-26'), day('2026-10-27')],
            buckets: [...bucketsBetween('2026-10-26', '08:10', '16:00', 10), ...bucketsBetween('2026-10-27', '08:10', '16:00', 60)],
        }), week);
        const [p] = r.picker_breakdown;
        // Lunes festivo 287.40; martes 60 × 6.50 = 390.00 (sin complemento)
        expect(dayTotals(p)).toEqual({ '2026-10-26': 287.4, '2026-10-27': 390 });
        expect(p.total_earnings).toBe(677.4);
    });
});

// ── Día alternativo por festivo trabajado ───────────────────────────────────
describe('alternative holiday for each public holiday worked (Holidays Act 2003 s.56/s.60)', () => {
    it('one day owed per public holiday worked, none for ordinary days', async () => {
        // 21-dic-2026 → 3-ene-2027: Navidad (vie 25), Boxing Day trasladado (lun 28) y Año Nuevo (vie 1)
        const shifts = ['2026-12-24', '2026-12-25', '2026-12-28', '2026-12-30', '2027-01-01']
            .map(date => ({ date, from: '08:00', to: '12:00' }));
        const r = await computePayroll(db({ shifts }), { start_date: '2026-12-21', end_date: '2027-01-03' });
        expect(r.picker_breakdown[0].alternative_holidays_owed).toBe(3);
        expect(r.summary.total_alternative_holidays_owed).toBe(3);
    });

    it('a public holiday with buckets only (no timesheet) still counts as worked', async () => {
        const r = await computePayroll(db({ buckets: bucketsBetween('2026-10-26', '09:00', '11:00', 8) }), { start_date: '2026-10-26', end_date: '2026-11-01' });
        expect(r.picker_breakdown[0].alternative_holidays_owed).toBe(1);
    });

    it('nobody is owed a day for a public holiday they did not work', async () => {
        const r = await computePayroll(db({ shifts: [{ date: '2026-10-27', from: '08:00', to: '12:00' }] }), { start_date: '2026-10-26', end_date: '2026-11-01' });
        expect(r.picker_breakdown[0].alternative_holidays_owed).toBe(0);
    });

    it('counted once per person: in the orchard where they worked that day, not in the others', async () => {
        const shifts = [
            { picker_id: 'p1', orchard_id: 'o2', date: '2026-10-26', from: '08:00', to: '12:00' },
            { picker_id: 'p1', orchard_id: 'o1', date: '2026-10-27', from: '08:00', to: '12:00' },
        ];
        const week = { start_date: '2026-10-26', end_date: '2026-11-01' };
        const company = await computePayroll(db({ shifts }), week);
        const o1 = await computePayroll(db({ shifts }), { ...week, orchard_id: 'o1' });
        const o2 = await computePayroll(db({ shifts }), { ...week, orchard_id: 'o2' });
        expect(company.picker_breakdown[0].alternative_holidays_owed).toBe(1);
        expect(o1.picker_breakdown[0].alternative_holidays_owed).toBe(0);
        expect(o2.picker_breakdown[0].alternative_holidays_owed).toBe(1);
    });
});

// ── KiwiSaver, PAYE y holiday pay: los hace el programa de nóminas ─────────
describe('KiwiSaver, PAYE and casual holiday pay are left to the payroll program', () => {
    it('the KiwiSaver rates the app knows are the 2026 ones (informative only)', () => {
        // Desde el 1-abr-2026: 3,5 % por defecto (3 % solo con reducción temporal de IRD); empresa al menos 3,5 %
        expect([...NZ_KIWISAVER_RATES]).toEqual([0.03, 0.035, 0.04, 0.06, 0.08, 0.1]);
        expect(NZ_KIWISAVER_EMPLOYER_MIN).toBe(0.035);
    });

    it('payroll gives the gross only: total = buckets + holiday premium + top-up, no deductions', async () => {
        const r = await computePayroll(db({
            shifts: [{ date: '2026-10-26', from: '08:00', to: '16:30', breakAt: '12:00' }, { date: '2026-10-27', from: '08:00', to: '16:30', breakAt: '12:00' }],
            buckets: bucketsBetween('2026-10-27', '08:10', '16:00', 30),
        }), { start_date: '2026-10-26', end_date: '2026-11-01' });
        const [p] = r.picker_breakdown;
        expect(Math.round((p.piece_rate_earnings + p.holiday_premium + p.top_up_required) * 100)).toBe(Math.round(p.total_earnings * 100));
        // Ni descuentos ni el 8 % de holiday pay: ningún campo de eso en la nómina
        const keys = Object.keys(p).join(' ').toLowerCase();
        expect(keys).not.toMatch(/kiwisaver|paye|deduct|tax|holiday_pay|net/);
    });

    it('the Xero and PaySauce files carry earnings lines only, adding up to the gross', () => {
        const data: PayrollExportData = {
            date: '2026-10-26', period: { start: '2026-10-26', end: '2026-11-01' },
            crew: [{
                id: 'p1', name: 'Ana', employeeId: 'E1', buckets: 10, hours: 8, pieceEarnings: 65, holidayPremium: 32.5,
                minimumTopUp: 189.9, totalEarnings: 287.4, status: 'active',
                pieceLines: [{ variety: 'Gala', rate: 6.5, buckets: 10, earnings: 65 }],
            }],
        } as PayrollExportData;
        for (const csv of [generateXeroCSV(data), generatePaySauceCSV(data)]) {
            const lines = csv.split('\n').slice(1);
            expect(lines).toHaveLength(3);
            expect(csv.toLowerCase()).not.toMatch(/kiwisaver|paye|deduction|holiday pay 8|8%/);
            const sum = lines.reduce((s, l) => s + Math.round(Number(l.split(',').pop()) * 100), 0);
            expect(sum).toBe(28740);
        }
    });
});
