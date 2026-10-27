// @vitest-environment node
/**
 * Nómina vista desde un huerto (decisión del dueño, 2026-10-27): el manager
 * solo ve la parte de su huerto. Una persona que trabajó en A y en B el mismo
 * día: desde B no sale nada de A (tramos, cubetas, precios ni importes).
 */
import { describe, it, expect } from 'vitest';
import { payForRange, type PayDay } from './pay-rules.ts';
import { orchardDayView, payrollForOrchard } from './payroll-orchard.ts';
import type { PayrollResult, PickerBreakdown } from './payroll-calc.ts';

const d = '2026-10-13';
const at = (hhmm: string) => new Date(`${d}T${hhmm}:00+13:00`).toISOString();
const now = new Date('2026-10-20T00:00:00Z');

/** p1: A 07:00–11:00 (10 Gala a 5 $), B 12:00–15:00 (10 Envy a 7 $) */
function rotatingDay(): PayDay {
    const [r] = payForRange({
        attendance: [
            { pickerId: 'p1', date: d, orchardId: 'A', checkIn: at('07:00'), checkOut: at('11:00') },
            { pickerId: 'p1', date: d, orchardId: 'B', checkIn: at('12:00'), checkOut: at('15:00') },
        ],
        buckets: [
            ...Array.from({ length: 10 }, (_, i) => ({ pickerId: 'p1', scannedAt: at(`08:${10 + i}`), orchardId: 'A', variety: 'Gala', pieceRate: 5 })),
            ...Array.from({ length: 10 }, (_, i) => ({ pickerId: 'p1', scannedAt: at(`13:${10 + i}`), orchardId: 'B', variety: 'Envy', pieceRate: 7 })),
        ],
        pieceRate: 6.5,
        minWage: 23.95,
        now,
    });
    return r.dayDetails[0];
}

/** Lo que no puede aparecer en la vista de B: el huerto A y su precio */
function leaksOrchardA(x: unknown): boolean {
    const text = JSON.stringify(x);
    return text.includes('"A"') || text.includes('Gala') || /"rate":5[,}]/.test(text);
}

describe('orchardDayView', () => {
    it('B sees only its segment, buckets, price line and share; nothing of A', () => {
        const day = rotatingDay();
        expect(leaksOrchardA(day)).toBe(true); // el día entero sí lleva A
        const shareB = day.byOrchard.find(o => o.orchardId === 'B')!;
        const v = orchardDayView(day, 'B');
        expect(leaksOrchardA(v)).toBe(false);
        expect(v.segments.map(s => s.orchardId)).toEqual(['B']);
        expect(v.pieceLines).toEqual([{ orchardId: 'B', variety: 'Envy', rate: 7, buckets: 10, earnings: 70 }]);
        expect(v.bucketsByVariety).toEqual({ Envy: 10 });
        expect(v.byOrchard).toEqual([shareB]);
        expect([v.hours, v.buckets, v.pieceEarnings, v.topUp, v.total])
            .toEqual([shareB.hours, 10, 70, shareB.topUp, shareB.total]);
        // Su mitad del trayecto (1 h entre A y B)
        expect(v.travelMinutes).toBe(30);
    });

    it('the two views add up to the whole day (no cent lost or shown twice)', () => {
        const day = rotatingDay();
        const a = orchardDayView(day, 'A');
        const b = orchardDayView(day, 'B');
        expect(Math.round((a.total + b.total) * 100)).toBe(Math.round(day.total * 100));
        expect(a.buckets + b.buckets).toBe(day.buckets);
        expect(Math.round((a.hours + b.hours) * 100)).toBe(Math.round(day.hours * 100));
    });

    it('a day entirely in one orchard is unchanged', () => {
        const [r] = payForRange({
            attendance: [{ pickerId: 'p1', date: d, orchardId: 'B', checkIn: at('08:00'), checkOut: at('12:00') }],
            buckets: [{ pickerId: 'p1', scannedAt: at('09:00'), orchardId: 'B', variety: 'Envy', pieceRate: 7 }],
            pieceRate: 6.5, minWage: 23.95, now,
        });
        const day = r.dayDetails[0];
        expect(orchardDayView(day, 'B')).toEqual(day);
    });

    it('closed weeks saved before lines had an orchard: unattributable lines are dropped on mixed days', () => {
        const day = rotatingDay();
        const old = { ...day, pieceLines: day.pieceLines.map(({ orchardId: _o, ...l }) => l) } as unknown as PayDay;
        const v = orchardDayView(old, 'B');
        expect(v.pieceLines).toEqual([]);
        expect(v.bucketsByVariety).toEqual({});
        expect(v.pieceEarnings).toBe(70);
        expect(leaksOrchardA(v)).toBe(false);
    });
});

describe('payrollForOrchard (foto de una semana cerrada)', () => {
    function companySnapshot(): PayrollResult {
        const day = rotatingDay();
        const onlyA: PickerBreakdown = {
            picker_id: 'p2', picker_name: 'Only A', buckets: 10, hours_worked: 4, hours_ordinary: 4, hours_holiday: 0,
            piece_rate_earnings: 50, holiday_premium: 0, hourly_rate: 12.5, minimum_required: 95.8, top_up_required: 45.8,
            total_earnings: 95.8, is_below_minimum: true, alternative_holidays_owed: 0, estimated_days: 0,
            days: [orchardDayView(day, 'A')],
        };
        const rotating: PickerBreakdown = {
            picker_id: 'p1', picker_name: 'Rotates', buckets: day.buckets, hours_worked: day.hours, hours_ordinary: day.hours,
            hours_holiday: 0, piece_rate_earnings: day.pieceEarnings, holiday_premium: 0, hourly_rate: 0,
            minimum_required: 191.6, top_up_required: day.topUp, total_earnings: day.total, is_below_minimum: day.belowMinimum,
            alternative_holidays_owed: 0, estimated_days: 0, days: [day],
        };
        return {
            orchard_id: 'company',
            date_range: { start: '2026-10-12', end: '2026-10-18' },
            summary: { total_buckets: 0, total_hours: 0, total_piece_rate_earnings: 0, total_top_up: 0, total_earnings: 0, total_alternative_holidays_owed: 0, total_estimated_days: 0 },
            compliance: { workers_below_minimum: 0, workers_total: 2, compliance_rate: 100 },
            picker_breakdown: [onlyA, rotating],
            settings: { bucket_rate: 5, min_wage_rate: 23.95, stored_min_wage: 23.95 },
        };
    }

    it('B: only the rotating person, with B\'s share; totals of B only', () => {
        const day = rotatingDay();
        const shareB = day.byOrchard.find(o => o.orchardId === 'B')!;
        const r = payrollForOrchard(companySnapshot(), 'B');
        expect(r.orchard_id).toBe('B');
        expect(r.picker_breakdown.map(p => p.picker_id)).toEqual(['p1']);
        const p = r.picker_breakdown[0];
        expect([p.buckets, p.hours_worked, p.piece_rate_earnings, p.top_up_required, p.total_earnings])
            .toEqual([10, shareB.hours, 70, shareB.topUp, shareB.total]);
        expect(p.minimum_required).toBeCloseTo(191.6 * shareB.hours / day.hours, 2);
        expect(r.summary.total_earnings).toBe(shareB.total);
        expect(r.compliance.workers_total).toBe(1);
        expect(leaksOrchardA(r.picker_breakdown)).toBe(false);
        expect(JSON.stringify(r)).not.toContain('p2');
    });

    it('an orchard where nobody worked that week sees an empty payroll', () => {
        const r = payrollForOrchard(companySnapshot(), 'C');
        expect(r.picker_breakdown).toEqual([]);
        expect(r.summary.total_earnings).toBe(0);
        expect(r.compliance).toEqual({ workers_below_minimum: 0, workers_total: 0, compliance_rate: 100 });
    });
});
