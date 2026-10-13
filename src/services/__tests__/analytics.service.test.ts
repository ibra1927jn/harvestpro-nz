// =============================================
// ANALYTICS SERVICE TESTS
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as nzstModule from '@/utils/nzst';
import { analyticsService } from '../analytics.service';
import { NZ_MINIMUM_WAGE_2026 as MINIMUM_WAGE, NZ_DEFAULT_PIECE_RATE as PIECE_RATE } from '@/constants/nz-law';
import type { BucketRecord } from '@/types/app.types';

// Fixed time for deterministic groupByHour tests
const FIXED_NOW = '2024-06-15T14:00:00';
const FIXED_TIME = new Date(FIXED_NOW).getTime();

describe('Analytics Service', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_TIME);
        vi.spyOn(nzstModule, 'nowNZST').mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    // =============================================
    // WAGE STATUS CALCULATION
    // =============================================
    describe('calculateWageStatus', () => {
        it('should return "safe" when earnings exceed minimum wage', () => {
            // 20 buckets * $6.50 = $130 earnings, 4 hours * $23.95 = $94 min wage
            // $130/$94 = 138% → safe
            const result = analyticsService.calculateWageStatus(20, 4, PIECE_RATE, MINIMUM_WAGE);
            expect(result.status).toBe('safe');
            expect(result.earnings).toBeGreaterThan(result.minWageEarnings);
        });

        it('should return "at_risk" when earnings are 80-100% of minimum wage', () => {
            // Need earnings between 80-100% of minWage
            // 4 hours * $23.95 = $94 minWage, 80% = $75.20, 100% = $94
            // At $6.50/bucket: $75.20/6.50 = 11.57, $94/6.50 = 14.46
            // So 13 buckets → $84.50 → 84.50/94 = 89.9% → at_risk
            const result = analyticsService.calculateWageStatus(13, 4, PIECE_RATE, MINIMUM_WAGE);
            expect(result.status).toBe('at_risk');
        });

        it('should return "below_minimum" when earnings are under 80% of minimum wage', () => {
            // 5 buckets * $6.50 = $32.50 earnings, 4 hours * $23.95 = $94 min wage
            // $32.50/$94 = 34.6% < 80%
            const result = analyticsService.calculateWageStatus(5, 4, PIECE_RATE, MINIMUM_WAGE);
            expect(result.status).toBe('below_minimum');
        });

        it('should calculate earnings correctly', () => {
            const result = analyticsService.calculateWageStatus(10, 4, PIECE_RATE, MINIMUM_WAGE);
            expect(result.earnings).toBe(10 * PIECE_RATE);
            expect(result.minWageEarnings).toBe(4 * MINIMUM_WAGE);
        });

        it('should handle zero hours (avoid division issues)', () => {
            const result = analyticsService.calculateWageStatus(10, 0, PIECE_RATE, MINIMUM_WAGE);
            expect(result.status).toBe('safe');
            expect(result.minWageEarnings).toBe(0);
        });

        it('should handle zero buckets', () => {
            const result = analyticsService.calculateWageStatus(0, 4, PIECE_RATE, MINIMUM_WAGE);
            expect(result.status).toBe('below_minimum');
            expect(result.earnings).toBe(0);
        });
    });

    // =============================================
    // ETA CALCULATION
    // =============================================
    describe('calculateETA', () => {
        it('should return "Complete!" when target already met', () => {
            const result = analyticsService.calculateETA(10, 10, 50);
            expect(result.eta).toBe('Complete!');
            expect(result.status).toBe('ahead');
            expect(result.hoursRemaining).toBe(0);
        });

        it('should return "Complete!" when current exceeds target', () => {
            const result = analyticsService.calculateETA(15, 10, 50);
            expect(result.eta).toBe('Complete!');
            expect(result.status).toBe('ahead');
        });

        it('should handle zero velocity', () => {
            const result = analyticsService.calculateETA(5, 10, 0);
            expect(result.eta).toBe('Awaiting data...');
            expect(result.status).toBe('behind');
            expect(result.hoursRemaining).toBe(Infinity);
        });

        it('should calculate hours remaining correctly', () => {
            // 5 tons remaining, 72 buckets/ton = 360 buckets, at 40 buckets/hour = 9 hours
            const result = analyticsService.calculateETA(5, 10, 40, 72);
            expect(result.hoursRemaining).toBe(9);
        });

        it('should handle custom bucketsPerTon', () => {
            const result = analyticsService.calculateETA(0, 1, 100, 100);
            expect(result.hoursRemaining).toBe(1);
        });

        it('should return a time string for eta', () => {
            const result = analyticsService.calculateETA(5, 10, 100);
            expect(result.eta).toBeDefined();
            expect(typeof result.eta).toBe('string');
        });
    });

    // =============================================
    // GROUP BY HOUR
    // =============================================
    describe('groupByHour', () => {
        it('should return pre-filled hour slots for no records', () => {
            // groupByHour always returns 8 hour slots (even with empty input)
            const result = analyticsService.groupByHour([], 8);
            expect(result.length).toBe(8);
            // All counts should be 0
            result.forEach((slot: { hour: string; count: number }) => {
                expect(slot.count).toBe(0);
            });
        });

        it('should group records by hour', () => {
            const records = [
                { scanned_at: new Date(FIXED_TIME - 30 * 60000).toISOString() },
                { scanned_at: new Date(FIXED_TIME - 20 * 60000).toISOString() },
                { scanned_at: new Date(FIXED_TIME - 90 * 60000).toISOString() },
            ] as BucketRecord[];
            const result = analyticsService.groupByHour(records, 8);
            expect(result.length).toBe(8);
            // Total count should be 3
            const totalCount = result.reduce((sum: number, g: { count: number }) => sum + g.count, 0);
            expect(totalCount).toBe(3);
        });

        it('should count records per hour correctly', () => {
            // All within the same hour
            const records = Array.from({ length: 5 }, (_, i) => ({
                scanned_at: new Date(FIXED_TIME - i * 60000).toISOString(),
            })) as BucketRecord[];
            const result = analyticsService.groupByHour(records, 8);
            const totalCount = result.reduce((sum: number, g: { count: number }) => sum + g.count, 0);
            expect(totalCount).toBe(5);
        });

        it('should have hour labels in HH:00 format', () => {
            const result = analyticsService.groupByHour([], 8);
            result.forEach((slot: { hour: string }) => {
                expect(slot.hour).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
            });
        });
    });

    describe('NZ time whatever the device time zone', () => {
        const realTz = process.env.TZ;
        beforeEach(() => {
            process.env.TZ = 'UTC'; // portátil/móvil con otra zona
            vi.setSystemTime(new Date('2026-10-13T03:30:00Z')); // 16:30 en NZ (NZDT)
        });
        afterEach(() => { process.env.TZ = realTz; });

        it('labels and buckets the velocity chart by NZ hours', () => {
            const records = [{ scanned_at: '2026-10-13T03:10:00Z' }, { scanned_at: '2026-10-13T02:59:00Z' }] as BucketRecord[];
            const result = analyticsService.groupByHour(records, 2);
            expect(result).toEqual([{ hour: '15:00', count: 1 }, { hour: '16:00', count: 1 }]);
        });

        it('computes the ETA and the end of shift in NZ time', () => {
            // faltan 2 h → 18:30 NZ, después del fin de turno (17:00 NZ)
            const result = analyticsService.calculateETA(0, 2, 72, 72, '17:00');
            expect(result.eta).toBe('18:30');
            expect(result.status).toBe('behind');
        });
    });
});

