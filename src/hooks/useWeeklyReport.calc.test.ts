import { describe, it, expect } from 'vitest';
import { buildWeekBreakdown, summarizeBreakdown } from './useWeeklyReport';

const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;

describe('buildWeekBreakdown', () => {
    it('complemento por día y totales coherentes', () => {
        const attendance = ['2026-10-05', '2026-10-06'].map(date => ({
            picker_id: 'p1', date, check_in: t(date, '07:00'), check_out: t(date, '17:00'), break_start: t(date, '12:00'),
        }));
        const buckets = [
            ...Array.from({ length: 80 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-05', '10:00') })),
            ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-06', '10:00') })),
            { picker_id: 'p1', scanned_at: t('2026-10-06', '11:00'), quality_grade: 'reject' },
        ];
        const rows = buildWeekBreakdown({
            attendance, buckets, crew: [{ id: 'p1', name: 'Ana' }], pieceRate: 6.5, minWage: 23.5,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            picker_name: 'Ana', buckets: 90, hours_worked: 19,
            piece_rate_earnings: 585, top_up_required: 162.53, total_earnings: 747.53,
            is_below_minimum: true,
        });
        expect(summarizeBreakdown(rows)).toEqual({
            totalHours: 19, totalEarnings: 747.53, costPerBin: 8.31, avgBPA: 4.7,
        });
    });
});
