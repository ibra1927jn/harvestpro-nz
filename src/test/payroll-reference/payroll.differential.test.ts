/**
 * Prueba DIFERENCIAL de nómina: semanas generadas al azar (fast-check) se pagan
 * con la implementación de referencia (reference.ts, escrita desde las reglas)
 * y con cada camino de pago de la app; todos deben dar lo mismo al céntimo.
 *
 * Caminos comparados:
 *  - payForRange (pay.ts): el cálculo único
 *  - computePayroll (Edge Function calculate-payroll / close-pay-week), con un
 *    Supabase en memoria: tarifas por huerto y variedad, contratos, filtros de fechas
 *  - exportaciones CSV / Xero / PaySauce (se vuelven a leer y se suman)
 *  - computePerPicker (panel en vivo del manager / team leader)
 *  - buildWeekBreakdown (informe semanal sin conexión con el servidor)
 *
 * Rápido por defecto. Pasada larga: PAYROLL_DIFF_RUNS=3000 npx vitest run src/test/payroll-reference
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('@/config/analytics', () => ({ analytics: { trackPayrollExport: vi.fn() } }));

import { payForRange, pieceRateFor, type PickerRangePay } from '@/services/harvestMetrics/pay';
import { computePerPicker } from '@/services/harvestMetrics/perPicker';
import { buildWeekBreakdown } from '@/hooks/useWeeklyReport';
import { exportService } from '@/services/export.service';
import { generateXeroCSV, generatePaySauceCSV } from '@/services/export-payroll-formats.service';
import type { Picker, BucketRecord } from '@/types';
import { computePayroll, type PayrollResult } from '../../../supabase/functions/_shared/payroll-calc.ts';
import { referencePay, refNzDate, REF_NZ_PUBLIC_HOLIDAYS, type RefConfig, type RefDay, type RefRates } from './reference';
import { weekArb, diffRuns, type GeneratedWeek } from './generators';
import { fakeSupabase } from './fakeSupabase';

const RUNS = diffRuns();
const cents = (n: number) => Math.round(n * 100);
const holidays = REF_NZ_PUBLIC_HOLIDAYS;

function appRates(r: RefRates) {
    return { varietyRates: r.varietyRates.map(v => ({ orchardId: v.orchardId, variety: v.variety, pieceRate: v.rate })), orchardRates: r.orchardRates, fallback: r.fallback };
}

function appPay(w: GeneratedWeek, minWage = w.minWage, rates = w.rates): PickerRangePay[] {
    return payForRange({
        attendance: w.shifts.map(s => ({ ...s })),
        buckets: w.buckets.map(b => ({
            pickerId: b.pickerId, scannedAt: b.scannedAt, qualityGrade: b.grade, orchardId: b.orchardId, variety: b.variety,
            pieceRate: pieceRateFor(b, appRates(rates)),
        })),
        pieceRate: rates.fallback,
        minWage,
        isPublicHoliday: d => holidays.has(d),
        now: w.now,
    });
}

function refCfg(w: GeneratedWeek, over: Partial<RefConfig> = {}): RefConfig {
    return { rates: w.rates, minWage: w.minWage, holidays, now: w.now, hoursRounding: 'centihour', ...over };
}

/** Compara un día de la app con el de la referencia; devuelve el primer desacuerdo */
function dayMismatch(a: { hours: number; buckets: number; pieceEarnings: number; holidayPremium: number; topUp: number; total: number } | undefined, r: RefDay | undefined): string | null {
    if (!a && !r) return null;
    if (!a) return `missing in app: ${JSON.stringify(r)}`;
    if (!r) return a.total === 0 ? null : `missing in reference (app total ${a.total})`;
    if (Math.abs(a.hours - r.hours) > 1e-6) return `hours ${a.hours} vs ${r.hours}`;
    if (a.buckets !== r.buckets) return `buckets ${a.buckets} vs ${r.buckets}`;
    if (cents(a.pieceEarnings) !== r.pieceCents) return `piece ${a.pieceEarnings} vs ${r.pieceCents / 100}`;
    if (cents(a.holidayPremium) !== r.premiumCents) return `premium ${a.holidayPremium} vs ${r.premiumCents / 100}`;
    if (cents(a.topUp) !== r.topUpCents) return `topUp ${a.topUp} vs ${r.topUpCents / 100}`;
    if (cents(a.total) !== r.totalCents) return `total ${a.total} vs ${r.totalCents / 100}`;
    return null;
}

describe('payroll differential: payForRange ↔ reference', () => {
    it('every person-day agrees to the cent (hours, buckets, piece, holiday premium, top-up, total)', () => {
        fc.assert(fc.property(weekArb, w => {
            const ref = referencePay(w.shifts, w.buckets, refCfg(w));
            const app = appPay(w);
            const appDays = new Map(app.flatMap(p => p.dayDetails.map(d => [`${p.pickerId}|${d.date}`, d] as const)));
            const refDays = new Map(ref.map(d => [`${d.pickerId}|${d.date}`, d] as const));
            for (const k of new Set([...appDays.keys(), ...refDays.keys()])) {
                const m = dayMismatch(appDays.get(k), refDays.get(k));
                if (m) throw new Error(`${k}: ${m}`);
            }
        }), { numRuns: RUNS });
    });

    it('week totals are the sum of the days, and each day splits exactly across orchards', () => {
        fc.assert(fc.property(weekArb, w => {
            for (const p of appPay(w)) {
                const sum = (f: (d: PickerRangePay['dayDetails'][number]) => number) => p.dayDetails.reduce((s, d) => s + cents(f(d)), 0);
                expect(cents(p.total)).toBe(sum(d => d.total));
                expect(cents(p.topUp)).toBe(sum(d => d.topUp));
                expect(cents(p.pieceEarnings)).toBe(sum(d => d.pieceEarnings));
                for (const d of p.dayDetails) {
                    expect(cents(d.pieceEarnings) + cents(d.holidayPremium) + cents(d.topUp)).toBe(cents(d.total));
                    expect(d.byOrchard.reduce((s, o) => s + cents(o.total), 0)).toBe(cents(d.total));
                    expect(d.byOrchard.reduce((s, o) => s + cents(o.hours), 0)).toBe(cents(d.hours));
                    expect(d.byOrchard.reduce((s, o) => s + o.buckets, 0)).toBe(d.buckets);
                    // Nunca por debajo del mínimo legal × horas (× 1.5 en festivo)
                    const mult = d.isPublicHoliday ? 1.5 : 1;
                    expect(d.total + 1e-9).toBeGreaterThanOrEqual(Math.floor(d.hours * Math.max(23.95, w.minWage) * mult * 100) / 100);
                }
            }
        }), { numRuns: RUNS });
    });

    it('with exact (unrounded) hours the difference stays within the 0.01 h rounding (≤ 0.15 $/day)', () => {
        fc.assert(fc.property(weekArb, w => {
            const exact = referencePay(w.shifts, w.buckets, refCfg(w, { hoursRounding: 'exact' }));
            const app = appPay(w);
            for (const e of exact) {
                const a = app.find(p => p.pickerId === e.pickerId)?.dayDetails.find(d => d.date === e.date);
                if (a) expect(Math.abs(cents(a.total) - e.totalCents)).toBeLessThanOrEqual(15);
            }
        }), { numRuns: RUNS });
    });
});

// ─── Edge Function (computePayroll) con un Supabase en memoria ──────────────

function dbTables(w: GeneratedWeek, contracts: Record<string, number>) {
    const settings = [
        { orchard_id: 'orch-a', piece_rate: w.rates.orchardRates['orch-a'], min_wage_rate: w.minWage },
        { orchard_id: 'orch-b', piece_rate: w.rates.orchardRates['orch-b'], min_wage_rate: w.minWage },
    ];
    return {
        harvest_settings: settings,
        variety_rates: w.rates.varietyRates.map(v => ({ orchard_id: v.orchardId, variety: v.variety, piece_rate: v.rate })),
        bucket_records: [
            ...w.buckets.map((b, i) => ({ id: i, picker_id: b.pickerId, orchard_id: b.orchardId, variety: b.variety, scanned_at: b.scannedAt, quality_grade: b.grade ?? null, deleted_at: null })),
            // Una cubeta borrada nunca se paga
            ...w.buckets.slice(0, 1).map(b => ({ id: -1, picker_id: b.pickerId, orchard_id: b.orchardId, variety: b.variety, scanned_at: b.scannedAt, quality_grade: 'A', deleted_at: '2026-01-01T00:00:00Z' })),
        ],
        daily_attendance: w.shifts.map((s, i) => ({ id: i, picker_id: s.pickerId, orchard_id: s.orchardId, date: s.date, check_in: s.checkIn, check_out: s.checkOut, break_start: s.breakStart ?? null, break_minutes: s.breakMinutes ?? null, deleted_at: null })),
        contracts: Object.entries(contracts).map(([id, rate]) => ({ employee_id: id, hourly_rate: rate, start_date: '2026-01-01', end_date: null, status: 'active' })),
        pickers: ['picker-1', 'picker-2', 'picker-3'].map(id => ({ id, name: `Name ${id}` })),
    };
}

async function edgePayroll(w: GeneratedWeek, contracts: Record<string, number> = {}, orchardId?: string): Promise<PayrollResult> {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // La Edge Function usa el reloj real para los turnos abiertos de hoy
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(w.now);
    try {
        return await computePayroll(fakeSupabase(dbTables(w, contracts)), { orchard_id: orchardId, start_date: w.weekStart, end_date: w.weekEnd });
    } finally {
        vi.useRealTimers();
    }
}

/** Configuración de referencia equivalente a la que ve la Edge Function */
function edgeRefCfg(w: GeneratedWeek, contracts: Record<string, number>): RefConfig {
    // Sin precio de huerto (orch-c): el del primer huerto con precio
    return refCfg(w, { rates: { ...w.rates, fallback: w.rates.orchardRates['orch-a'] }, contractRates: contracts });
}

const inWeek = (w: GeneratedWeek, d: string) => d >= w.weekStart && d <= w.weekEnd;

describe('payroll differential: calculate-payroll (Edge Function) ↔ reference', () => {
    it('company-wide pay per person and per day matches, with contract rates above the minimum', async () => {
        await fc.assert(fc.asyncProperty(weekArb, fc.constantFrom<Record<string, number>>({}, { 'picker-1': 27.5 }), async (w, contracts) => {
            const result = await edgePayroll(w, contracts);
            const ref = referencePay(w.shifts, w.buckets, edgeRefCfg(w, contracts)).filter(d => inWeek(w, d.date));
            for (const p of result.picker_breakdown) {
                const refDays = ref.filter(d => d.pickerId === p.picker_id);
                for (const d of p.days) {
                    const m = dayMismatch(d, refDays.find(r => r.date === d.date));
                    if (m) throw new Error(`${p.picker_id} ${d.date}: ${m}`);
                }
                for (const r of refDays) {
                    if (!p.days.some(d => d.date === r.date)) throw new Error(`${p.picker_id} ${r.date}: missing in edge`);
                }
                expect(cents(p.total_earnings)).toBe(refDays.reduce((s, d) => s + d.totalCents, 0));
                // Holidays Act s.60: un día alternativo por festivo trabajado
                expect(p.alternative_holidays_owed).toBe(refDays.filter(d => d.holiday).length);
            }
            const people = new Set(ref.map(d => d.pickerId));
            for (const id of people) expect(result.picker_breakdown.some(p => p.picker_id === id)).toBe(true);
            expect(cents(result.summary.total_earnings)).toBe(ref.reduce((s, d) => s + d.totalCents, 0));
        }), { numRuns: Math.max(20, Math.round(RUNS / 3)) });
    });
});

describe('payroll differential: calculate-payroll per orchard ↔ company split', () => {
    it('the payroll of one orchard is exactly that orchard\'s share of the company payroll (and the orchards add up)', async () => {
        await fc.assert(fc.asyncProperty(weekArb, async w => {
            const company = await edgePayroll(w);
            const sumByPicker = new Map<string, number>();
            for (const orchard of ['orch-a', 'orch-b']) {
                const r = await edgePayroll(w, {}, orchard);
                for (const p of company.picker_breakdown) {
                    const share = p.days.flatMap(d => d.byOrchard).filter(o => o.orchardId === orchard);
                    const own = r.picker_breakdown.find(x => x.picker_id === p.picker_id);
                    expect([orchard, p.picker_id, cents(own?.total_earnings ?? 0), cents(own?.top_up_required ?? 0)])
                        .toEqual([orchard, p.picker_id, share.reduce((s, o) => s + cents(o.total), 0), share.reduce((s, o) => s + cents(o.topUp), 0)]);
                    sumByPicker.set(p.picker_id, (sumByPicker.get(p.picker_id) ?? 0) + cents(own?.total_earnings ?? 0));
                }
            }
            // orch-c no tiene harvest_settings (la función lo rechaza): su parte se suma aparte
            for (const p of company.picker_breakdown) {
                const c = p.days.flatMap(d => d.byOrchard).filter(o => o.orchardId === 'orch-c').reduce((s, o) => s + cents(o.total), 0);
                expect((sumByPicker.get(p.picker_id) ?? 0) + c).toBe(cents(p.total_earnings));
            }
        }), { numRuns: Math.max(20, Math.round(RUNS / 3)) });
    });
});

// ─── Exportaciones: se generan y se vuelven a leer ──────────────────────────

/** CSV simple (con comillas) → filas */
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    for (const line of text.split('\n')) {
        const cells: string[] = [];
        let cur = '', quoted = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quoted) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
            } else if (c === '"') quoted = true;
            else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
        }
        cells.push(cur);
        rows.push(cells);
    }
    return rows;
}

describe('payroll differential: exports (CSV / Xero / PaySauce) ↔ calculate-payroll', () => {
    it('re-read exports: per-employee lines add up to the payroll total, to the cent', async () => {
        await fc.assert(fc.asyncProperty(weekArb, async w => {
            const result = await edgePayroll(w);
            const data = exportService.preparePayrollData(result.picker_breakdown, { start: w.weekStart, end: w.weekEnd });
            const totalOf = new Map(result.picker_breakdown.map(p => [p.picker_id, cents(p.total_earnings)]));

            // CSV: columnas por persona
            const csv = parseCsv(exportService.generateCSV(data));
            const header = csv.findIndex(r => r[0] === 'Employee ID');
            for (const r of csv.slice(header + 1)) {
                if (!r[0] || r[0] === 'SUMMARY') break;
                const [id, , , , piece, premium, topUp, total] = r;
                expect(cents(Number(total))).toBe(totalOf.get(id));
                expect(cents(Number(piece)) + cents(Number(premium)) + cents(Number(topUp))).toBe(cents(Number(total)));
            }
            const grand = csv.find(r => r[0] === 'Grand Total');
            expect(cents(Number(grand?.[7]))).toBe(cents(result.summary.total_earnings));

            // Xero y PaySauce: Amount por persona = total; cantidad × tarifa = importe en cada línea
            for (const [name, text] of [['xero', generateXeroCSV(data)], ['paysauce', generatePaySauceCSV(data)]] as const) {
                const rows = parseCsv(text).slice(1);
                const byEmp = new Map<string, number>();
                for (const r of rows) {
                    const [id, , , qty, rate, amount] = r;
                    byEmp.set(id, (byEmp.get(id) ?? 0) + cents(Number(amount)));
                    if (cents(Number(qty) * Number(rate)) !== cents(Number(amount))) {
                        throw new Error(`${name} line ${r.join(',')}: quantity × rate ≠ amount`);
                    }
                }
                for (const [id, total] of totalOf) {
                    if (total > 0) expect([name, id, byEmp.get(id) ?? 0]).toEqual([name, id, total]);
                }
            }
        }), { numRuns: Math.max(20, Math.round(RUNS / 3)) });
    });
});

// ─── Panel en vivo e informe semanal (un huerto) ────────────────────────────

describe('payroll differential: live manager/team-leader screen and weekly report ↔ reference (single orchard)', () => {
    /** Solo lo del huerto A: el panel en vivo y el informe semanal ven un huerto */
    const onlyA = (w: GeneratedWeek): GeneratedWeek => ({
        ...w,
        shifts: w.shifts.filter(s => s.orchardId === 'orch-a'),
        buckets: w.buckets.filter(b => b.orchardId === 'orch-a'),
        rates: { ...w.rates, fallback: w.rates.orchardRates['orch-a'] },
    });

    it('live screen (computePerPicker): today per person matches', () => {
        fc.assert(fc.property(weekArb, raw => {
            const w = onlyA(raw);
            const today = refNzDate(w.now.getTime());
            const shifts = w.shifts.filter(s => s.date === today);
            const buckets = w.buckets.filter(b => refNzDate(b.scannedAt) === today);
            const ids = [...new Set([...shifts.map(s => s.pickerId), ...buckets.map(b => b.pickerId)])];
            const crew = ids.map(id => ({
                id, picker_id: id, name: id, role: 'picker', status: 'active',
                shifts: shifts.filter(s => s.pickerId === id).map(s => ({ check_in: s.checkIn, check_out: s.checkOut, break_start: s.breakStart, break_minutes: s.breakMinutes, orchard_id: s.orchardId })),
            })) as unknown as Picker[];
            const records = buckets.map((b, i) => ({ id: String(i), picker_id: b.pickerId, scanned_at: b.scannedAt, quality_grade: b.grade, orchard_id: b.orchardId, variety: b.variety })) as unknown as BucketRecord[];
            const live = computePerPicker(crew, records, {
                piece_rate: w.rates.fallback, min_wage_rate: w.minWage, shift_start_time: '07:00',
                variety_rates: w.rates.varietyRates.map(v => ({ orchard_id: v.orchardId, variety: v.variety, piece_rate: v.rate })),
            } as never, w.now);
            const ref = referencePay(shifts, buckets, refCfg(w)).filter(d => d.date === today);
            for (const m of live) {
                const r = ref.find(d => d.pickerId === m.pickerId);
                const mm = dayMismatch(r ? { hours: m.hoursWorked, buckets: m.bins, pieceEarnings: m.pieceRateEarnings, holidayPremium: r.premiumCents / 100, topUp: m.topUp, total: m.earned } : undefined, r);
                if (mm && !(m.bins === 0 && m.earned === 0 && !r)) throw new Error(`${m.pickerId}: ${mm}`);
            }
        }), { numRuns: RUNS });
    });

    it('weekly report fallback (buildWeekBreakdown): week per person matches', () => {
        fc.assert(fc.property(weekArb, raw => {
            const w = onlyA(raw);
            const rows = buildWeekBreakdown({
                attendance: w.shifts.map(s => ({ picker_id: s.pickerId, orchard_id: s.orchardId, date: s.date, check_in: s.checkIn, check_out: s.checkOut, break_start: s.breakStart, break_minutes: s.breakMinutes })),
                buckets: w.buckets.map(b => ({ picker_id: b.pickerId, orchard_id: b.orchardId, variety: b.variety, scanned_at: b.scannedAt, quality_grade: b.grade })),
                crew: [],
                pieceRate: w.rates.fallback,
                minWage: w.minWage,
                varietyRates: w.rates.varietyRates.map(v => ({ orchard_id: v.orchardId, variety: v.variety, piece_rate: v.rate })) as never,
                now: w.now,
            });
            // buildWeekBreakdown usa los festivos de la app: deben ser los mismos
            const ref = referencePay(w.shifts, w.buckets, refCfg(w));
            for (const p of rows) {
                const days = ref.filter(d => d.pickerId === p.picker_id);
                expect([p.picker_id, cents(p.total_earnings)]).toEqual([p.picker_id, days.reduce((s, d) => s + d.totalCents, 0)]);
                expect(cents(p.top_up_required)).toBe(days.reduce((s, d) => s + d.topUpCents, 0));
            }
        }), { numRuns: RUNS });
    });
});
