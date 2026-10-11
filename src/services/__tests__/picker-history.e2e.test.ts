/**
 * E2E tests for picker-history.service.ts (274L) — exercises ALL methods
 * getPickerHistory (full flow), computeQuality (grades A/B/C/reject),
 * computeRiskBadges (fatigue, chronic top-up, quality drop)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockGetPickerById = vi.fn().mockResolvedValue({
    id: 'p1', picker_id: 'P-001', name: 'Alice', team_leader_id: 'tl1',
    status: 'active', created_at: '2025-01-01', total_buckets_today: 10,
});
const mockGetUserName = vi.fn().mockResolvedValue('Bob (TL)');
const mockGetAttendanceSince = vi.fn().mockResolvedValue([
    { date: '2026-03-08', check_in: '2026-03-08T06:00:00Z', check_out: '2026-03-08T14:00:00Z', status: 'present' },
    { date: '2026-03-09', check_in: '2026-03-09T06:00:00Z', check_out: '2026-03-09T14:00:00Z', status: 'present' },
    { date: '2026-03-10', check_in: '2026-03-10T06:00:00Z', check_out: null, status: 'present' },
]);
const mockGetBucketRecordsSince = vi.fn().mockResolvedValue([
    { scanned_at: '2026-03-08T08:00:00Z' }, { scanned_at: '2026-03-08T09:00:00Z' },
    { scanned_at: '2026-03-08T10:00:00Z' }, { scanned_at: '2026-03-08T11:00:00Z' },
    { scanned_at: '2026-03-09T08:00:00Z' }, { scanned_at: '2026-03-09T09:00:00Z' },
    { scanned_at: '2026-03-10T08:00:00Z' }, { scanned_at: '2026-03-10T09:00:00Z' },
    { scanned_at: '2026-03-10T10:00:00Z' },
]);
const mockGetInspectionsSince = vi.fn().mockResolvedValue([
    { quality_grade: 'A' }, { quality_grade: 'A' }, { quality_grade: 'B' },
    { quality_grade: 'good' }, { quality_grade: 'warning' },
]);
const mockGetDaySetupsSince = vi.fn().mockResolvedValue([
    { date: '2026-03-08', variety: 'Braeburn', piece_rate: 6.50, min_wage_rate: 23.95 },
    { date: '2026-03-09', variety: 'Gala', piece_rate: 7.00, min_wage_rate: 23.95 },
]);

vi.mock('@/repositories/picker-history.repository', () => ({
    pickerHistoryRepository: {
        getPickerById: (...a: unknown[]) => mockGetPickerById(...a),
        getUserName: (...a: unknown[]) => mockGetUserName(...a),
        getAttendanceSince: (...a: unknown[]) => mockGetAttendanceSince(...a),
        getBucketRecordsSince: (...a: unknown[]) => mockGetBucketRecordsSince(...a),
        getInspectionsSince: (...a: unknown[]) => mockGetInspectionsSince(...a),
        getDaySetupsSince: (...a: unknown[]) => mockGetDaySetupsSince(...a),
    },
}));

import { pickerHistoryService } from '../picker-history.service';

describe('pickerHistoryService — E2E deep tests', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('getPickerHistory', () => {
        it('returns full picker history', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1', 14);
            expect(history).not.toBeNull();
            expect(history!.profile.name).toBe('Alice');
            expect(history!.profile.team_leader_name).toBe('Bob (TL)');
            expect(history!.dailyRecords.length).toBeGreaterThan(0);
        });

        it('computes today stats correctly', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.todayBuckets).toBeGreaterThanOrEqual(0);
        });

        it('returns null when picker not found', async () => {
            mockGetPickerById.mockResolvedValueOnce(null);
            const history = await pickerHistoryService.getPickerHistory('p999', 'o1');
            expect(history).toBeNull();
        });

        it('handles no team leader', async () => {
            mockGetPickerById.mockResolvedValueOnce({
                id: 'p2', picker_id: 'P-002', name: 'Charlie', team_leader_id: null,
                status: 'active', created_at: '2025-06-01', total_buckets_today: 0,
            });
            const history = await pickerHistoryService.getPickerHistory('p2', 'o1');
            expect(history!.profile.team_leader_name).toBeNull();
            expect(mockGetUserName).not.toHaveBeenCalled();
        });

        it('returns sorted daily records', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const dates = history!.dailyRecords.map(r => r.date);
            expect(dates).toEqual([...dates].sort());
        });

        it('calculates hours from check-in/out', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const mar8 = history!.dailyRecords.find(r => r.date === '2026-03-08');
            expect(mar8).toBeDefined();
            expect(mar8!.hours).toBe(7.5); // 8 h − 30 min de descanso no pagado
        });

        it('open shift on a past day: estimated from check-in to last scan and flagged', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const mar10 = history!.dailyRecords.find(r => r.date === '2026-03-10');
            expect(mar10).toBeDefined();
            expect(mar10!.estimated).toBe(true);
            expect(mar10!.hours).toBeGreaterThan(0);
        });

        it('computes quality scores', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.quality.total).toBe(5);
            expect(history!.quality.gradeA).toBe(3); // A + good
            expect(history!.quality.gradeB).toBe(2); // B + warning
            expect(history!.quality.score).toBeGreaterThan(0);
        });

        it('tracks varieties picked', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.varietiesPicked).toContain('Braeburn');
        });

        it('tracks team leaders worked with', async () => {
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.teamLeadersWorkedWith).toContain('Bob (TL)');
        });

        it('returns null on error', async () => {
            mockGetPickerById.mockRejectedValueOnce(new Error('DB error'));
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history).toBeNull();
        });
    });

    describe('computeQuality (via getPickerHistory)', () => {
        it('returns zero quality for no inspections', async () => {
            mockGetInspectionsSince.mockResolvedValueOnce([]);
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.quality.total).toBe(0);
            expect(history!.quality.score).toBe(0);
        });

        it('handles all-reject inspections', async () => {
            mockGetInspectionsSince.mockResolvedValueOnce([
                { quality_grade: 'reject' }, { quality_grade: 'bad' },
            ]);
            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.quality.reject).toBe(2);
            expect(history!.quality.score).toBe(0);
        });
    });

    describe('computeRiskBadges (via getPickerHistory)', () => {
        it('detects fatigue risk for 10+ consecutive days', async () => {
            // Create 12 consecutive days
            const dates = Array.from({ length: 12 }, (_, i) => {
                const d = new Date('2026-02-27');
                d.setDate(d.getDate() + i);
                return {
                    date: d.toISOString().split('T')[0],
                    check_in: `${d.toISOString().split('T')[0]}T06:00:00Z`,
                    check_out: `${d.toISOString().split('T')[0]}T14:00:00Z`,
                    status: 'present',
                };
            });
            mockGetAttendanceSince.mockResolvedValueOnce(dates);

            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const fatigue = history!.riskBadges.find(b => b.type === 'fatigue');
            expect(fatigue).toBeDefined();
            expect(fatigue!.severity).toBe('warning');
        });

        it('detects critical fatigue for 14+ consecutive days', async () => {
            const dates = Array.from({ length: 16 }, (_, i) => {
                const d = new Date('2026-02-25');
                d.setDate(d.getDate() + i);
                return {
                    date: d.toISOString().split('T')[0],
                    check_in: `${d.toISOString().split('T')[0]}T06:00:00Z`,
                    check_out: `${d.toISOString().split('T')[0]}T14:00:00Z`,
                    status: 'present',
                };
            });
            mockGetAttendanceSince.mockResolvedValueOnce(dates);

            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const fatigue = history!.riskBadges.find(b => b.type === 'fatigue');
            expect(fatigue?.severity).toBe('critical');
        });

        it('detects chronic top-up', async () => {
            // Need 5+ daily records with >60% needing top-up
            const dates = Array.from({ length: 6 }, (_, i) => {
                const d = new Date('2026-03-04');
                d.setDate(d.getDate() + i);
                return {
                    date: d.toISOString().split('T')[0],
                    check_in: `${d.toISOString().split('T')[0]}T06:00:00Z`,
                    check_out: `${d.toISOString().split('T')[0]}T14:00:00Z`,
                    status: 'present',
                };
            });
            mockGetAttendanceSince.mockResolvedValueOnce(dates);
            // Very few buckets — each day will have piece < hourly
            mockGetBucketRecordsSince.mockResolvedValueOnce(
                dates.map(d => ({ scanned_at: `${d.date}T08:00:00Z` }))
            );
            // Day setups with high min wage
            mockGetDaySetupsSince.mockResolvedValueOnce(
                dates.map(d => ({ date: d.date, variety: 'Braeburn', piece_rate: 6.50, min_wage_rate: 30.00 }))
            );

            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const topUp = history!.riskBadges.find(b => b.type === 'chronic_topup');
            expect(topUp).toBeDefined();
        });

        it('detects low quality badge', async () => {
            mockGetInspectionsSince.mockResolvedValueOnce([
                { quality_grade: 'reject' }, { quality_grade: 'bad' },
                { quality_grade: 'C' }, { quality_grade: 'reject' },
            ]);

            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            const quality = history!.riskBadges.find(b => b.type === 'quality_drop');
            expect(quality).toBeDefined();
            expect(quality!.severity).toBe('critical'); // score < 30
        });

        it('returns no badges for healthy picker', async () => {
            // Only 3 days, good quality, no fatigue
            mockGetAttendanceSince.mockResolvedValueOnce([
                { date: '2026-03-08', check_in: '2026-03-08T06:00:00Z', check_out: '2026-03-08T14:00:00Z', status: 'present' },
                { date: '2026-03-10', check_in: '2026-03-10T06:00:00Z', check_out: '2026-03-10T14:00:00Z', status: 'present' },
            ]);
            mockGetBucketRecordsSince.mockResolvedValueOnce([
                { scanned_at: '2026-03-08T08:00:00Z' }, { scanned_at: '2026-03-08T09:00:00Z' },
                { scanned_at: '2026-03-10T08:00:00Z' }, { scanned_at: '2026-03-10T09:00:00Z' },
            ]);
            mockGetInspectionsSince.mockResolvedValueOnce([
                { quality_grade: 'A' }, { quality_grade: 'A' },
            ]);

            const history = await pickerHistoryService.getPickerHistory('p1', 'o1');
            expect(history!.riskBadges.length).toBe(0);
        });
    });
});


