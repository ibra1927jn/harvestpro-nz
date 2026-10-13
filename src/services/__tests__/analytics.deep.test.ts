/**
 * Deep edge-case tests for analytics.service.ts
 * Covers: calculateWageStatus, groupByHour, calculateETA, generateDailyReport, downloadCSV
 */
import { describe, it, expect, vi } from 'vitest';

// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    nowNZST: () => '2026-03-10T14:00:00.000+13:00',
    todayNZST: () => '2026-03-10',
}));

vi.mock('@/services/analytics-trends.service', () => {
    class AnalyticsTrendsService { }
    return { AnalyticsTrendsService, analyticsTrendsService: {} };
});

import { analyticsService } from '../analytics.service';

describe('AnalyticsService.calculateWageStatus', () => {
    it('returns safe when piece earnings exceed minimum wage', () => {
        const result = analyticsService.calculateWageStatus(20, 5, 10, 23);
        expect(result.status).toBe('safe');
        expect(result.earnings).toBe(200);
        expect(result.minWageEarnings).toBe(115);
    });

    it('returns at_risk when between 80% and 100%', () => {
        const result = analyticsService.calculateWageStatus(10, 5, 10, 23);
        // earnings=100, minWage=115, pct=87%
        expect(result.status).toBe('at_risk');
    });

    it('returns below_minimum when under 80%', () => {
        const result = analyticsService.calculateWageStatus(5, 5, 10, 23);
        // earnings=50, minWage=115, pct=43%
        expect(result.status).toBe('below_minimum');
    });

    it('returns safe when zero hours', () => {
        const result = analyticsService.calculateWageStatus(10, 0, 10, 23);
        expect(result.status).toBe('safe');
    });
});

describe('AnalyticsService.calculateETA', () => {
    it('returns Complete when target already reached', () => {
        const result = analyticsService.calculateETA(5, 3, 10);
        expect(result.status).toBe('ahead');
        expect(result.eta).toBe('Complete!');
        expect(result.hoursRemaining).toBe(0);
    });

    it('returns behind when velocity is 0', () => {
        const result = analyticsService.calculateETA(1, 10, 0);
        expect(result.status).toBe('behind');
        expect(result.hoursRemaining).toBe(Infinity);
    });

    it('returns a valid ETA with positive velocity', () => {
        const result = analyticsService.calculateETA(0, 1, 72);
        // 1 ton * 72 buckets/ton / 72 velocity = 1 hr
        expect(result.hoursRemaining).toBeCloseTo(1, 1);
        expect(['ahead', 'on_track', 'behind']).toContain(result.status);
    });
});

describe('AnalyticsService.groupByHour', () => {
    it('returns empty counts for no records', () => {
        const result = analyticsService.groupByHour([], 4);
        expect(result).toHaveLength(4);
        result.forEach(h => expect(h.count).toBe(0));
    });
});

describe('AnalyticsService.generateDailyReport', () => {
    const crew: any[] = [
        { id: 'p1', name: 'Alice', picker_id: 'P01', role: 'picker', total_buckets_today: 20, hours: 6, status: 'active', team_leader_id: 'tl1' },
        { id: 'tl1', name: 'Carlos', picker_id: 'TL01', role: 'team_leader', total_buckets_today: 0, hours: 8, status: 'active' },
    ];
    const settings = { piece_rate: 6.5, min_wage_rate: 23.95 };
    const teamLeaders: any[] = [{ id: 'tl1', name: 'Carlos' }];
    const metadata: any = { generated_at: '14:00', last_sync: '13:55', pending_queue_count: 0, orchard_name: 'Test Orchard', is_offline_data: false };

    it('generates CSV with header and picker rows', () => {
        const csv = analyticsService.generateDailyReport(crew, [], settings, teamLeaders, metadata);
        expect(csv).toContain('HarvestPro Daily Report');
        expect(csv).toContain('Alice');
        expect(csv).toContain('P01');
        expect(csv).toContain('Carlos');
        expect(csv).not.toContain('OFFLINE DATA');
    });

    it('adds offline warning when is_offline_data is true', () => {
        const offlineMeta = { ...metadata, is_offline_data: true, pending_queue_count: 5 };
        const csv = analyticsService.generateDailyReport(crew, [], settings, teamLeaders, offlineMeta);
        expect(csv).toContain('OFFLINE DATA');
        expect(csv).toContain('5 scans');
    });

    it('excludes team_leaders and runners from report rows', () => {
        const csv = analyticsService.generateDailyReport(crew, [], settings, teamLeaders, metadata);
        // Carlos (team_leader) should not appear as a data row
        const dataLines = csv.split('\n').filter(l => l.startsWith('"'));
        expect(dataLines.length).toBe(1); // Only Alice
    });
});

describe('AnalyticsService.downloadCSV', () => {
    it('creates and clicks a download link', () => {
        const clickFn = vi.fn();
        vi.spyOn(document, 'createElement').mockReturnValue({
            setAttribute: vi.fn(),
            click: clickFn,
            style: {},
        } as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

        analyticsService.downloadCSV('test,csv', 'file.csv');
        expect(clickFn).toHaveBeenCalled();
    });
});

