/**
 * picker-history.service.test.ts — Unit tests
 *
 * pickerHistoryService is a class instance with:
 *   - getPickerHistory(pickerId, orchardId, days?) → PickerHistory | null
 *   - computeQuality (private) and computeRiskBadges (private)
 *
 * Private methods are tested indirectly via getPickerHistory, or
 * by accessing them via type coercion for pure-logic coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabase } from '@/services/supabase';
import { pickerHistoryService } from '../picker-history.service';

// Access private methods for testing pure logic
const service = pickerHistoryService as unknown as {
    computeQuality: (inspections: Array<{ quality_grade: string | null }>) => {
        total: number; gradeA: number; gradeB: number; gradeC: number; reject: number; score: number;
    };
    computeRiskBadges: (
        attendance: Array<{ date: string; status: string }>,
        dailyRecords: Array<{ date: string; buckets: number; hours: number; earnings: number; variety: string | null; team_leader_name: string | null }>,
        quality: { total: number; gradeA: number; gradeB: number; gradeC: number; reject: number; score: number },
        daySetups: Array<{ date: string; piece_rate: number; min_wage_rate: number }>
    ) => Array<{ type: string; severity: string; label: string; detail: string }>;
};

describe('pickerHistoryService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('computeQuality (private — accessed for testing)', () => {
        it('returns zeroes for empty inspections', () => {
            const result = service.computeQuality([]);
            expect(result.total).toBe(0);
            expect(result.score).toBe(0);
        });

        it('returns 100 for all grade A', () => {
            const result = service.computeQuality([
                { quality_grade: 'A' },
                { quality_grade: 'A' },
                { quality_grade: 'good' }, // 'good' counts as A
            ]);
            expect(result.gradeA).toBe(3);
            expect(result.score).toBe(100);
        });

        it('computes mixed grades correctly', () => {
            const result = service.computeQuality([
                { quality_grade: 'A' },
                { quality_grade: 'B' },
                { quality_grade: 'C' },
                { quality_grade: 'reject' },
            ]);
            expect(result.total).toBe(4);
            expect(result.gradeA).toBe(1);
            expect(result.gradeB).toBe(1);
            expect(result.gradeC).toBe(1);
            expect(result.reject).toBe(1);
            // (100 + 70 + 40) / 4 = 52.5 → 53
            expect(result.score).toBe(53);
        });

        it('handles "warning" as grade B and "bad" as reject', () => {
            const result = service.computeQuality([
                { quality_grade: 'warning' },
                { quality_grade: 'bad' },
            ]);
            expect(result.gradeB).toBe(1);
            expect(result.reject).toBe(1);
        });

        it('handles null quality_grade', () => {
            const result = service.computeQuality([
                { quality_grade: null },
                { quality_grade: 'A' },
            ]);
            expect(result.total).toBe(2);
            expect(result.gradeA).toBe(1);
        });
    });

    describe('computeRiskBadges (private — accessed for testing)', () => {
        it('returns no badges when all is well', () => {
            const badges = service.computeRiskBadges(
                [{ date: '2026-03-01', status: 'present' }],
                [{ date: '2026-03-01', buckets: 50, hours: 8, earnings: 325, variety: null, team_leader_name: null }],
                { total: 5, gradeA: 5, gradeB: 0, gradeC: 0, reject: 0, score: 100 },
                [{ date: '2026-03-01', piece_rate: 6.5, min_wage_rate: 23.5 }]
            );
            expect(badges).toEqual([]);
        });

        it('detects fatigue risk at 10+ consecutive days', () => {
            const attendance = Array.from({ length: 12 }, (_, i) => ({
                date: `2026-03-${String(i + 1).padStart(2, '0')}`,
                status: 'present',
            }));
            const dailyRecords = attendance.map(a => ({
                date: a.date, buckets: 30, hours: 8, earnings: 200, variety: null, team_leader_name: null,
            }));

            const badges = service.computeRiskBadges(
                attendance, dailyRecords,
                { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, score: 0 },
                []
            );

            const fatigue = badges.find(b => b.type === 'fatigue');
            expect(fatigue).toBeDefined();
            expect(fatigue!.severity).toBe('warning');
        });

        it('detects critical fatigue at 14+ consecutive days', () => {
            const attendance = Array.from({ length: 15 }, (_, i) => ({
                date: `2026-03-${String(i + 1).padStart(2, '0')}`,
                status: 'present',
            }));
            const dailyRecords = attendance.map(a => ({
                date: a.date, buckets: 30, hours: 8, earnings: 200, variety: null, team_leader_name: null,
            }));

            const badges = service.computeRiskBadges(
                attendance, dailyRecords,
                { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, score: 0 },
                []
            );

            const fatigue = badges.find(b => b.type === 'fatigue');
            expect(fatigue).toBeDefined();
            expect(fatigue!.severity).toBe('critical');
        });

        it('detects chronic top-up (>60% days below piece rate)', () => {
            // 6 days with very low buckets → piece earnings < min wage earnings
            const dailyRecords = Array.from({ length: 6 }, (_, i) => ({
                date: `2026-03-${String(i + 1).padStart(2, '0')}`,
                buckets: 5, // 5 * 6.50 = 32.50
                hours: 8,   // 8 * 23.95 = 191.60
                earnings: 191.6,
                topUp: 159.1, // 191.60 − 32.50 (complemento del cálculo único)
                variety: null,
                team_leader_name: null,
            }));
            const attendance = dailyRecords.map(d => ({ date: d.date, status: 'present' }));
            const daySetups = dailyRecords.map(d => ({
                date: d.date, piece_rate: 6.5, min_wage_rate: 23.5,
            }));

            const badges = service.computeRiskBadges(
                attendance, dailyRecords,
                { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, score: 0 },
                daySetups
            );

            const topup = badges.find(b => b.type === 'chronic_topup');
            expect(topup).toBeDefined();
        });

        it('detects quality drop (score < 50 with >= 3 inspections)', () => {
            const badges = service.computeRiskBadges(
                [{ date: '2026-03-01', status: 'present' }],
                [{ date: '2026-03-01', buckets: 30, hours: 8, earnings: 200, variety: null, team_leader_name: null }],
                { total: 10, gradeA: 1, gradeB: 1, gradeC: 3, reject: 5, score: 25 },
                []
            );

            const quality = badges.find(b => b.type === 'quality_drop');
            expect(quality).toBeDefined();
            expect(quality!.severity).toBe('critical'); // score < 30
        });
    });

    describe('getPickerHistory', () => {
        it('returns null when picker not found', async () => {
            vi.spyOn(supabase, 'from').mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                    }),
                }),
            } as never);

            const result = await pickerHistoryService.getPickerHistory('bad-id', 'o-1');
            expect(result).toBeNull();
        });
    });
});

