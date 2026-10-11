/**
 * Tests for analytics-trends.service.ts
 * Covers: getRowDensity, getDailyBleed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('@/repositories/analytics-trends.repository', () => ({
  analyticsTrendsRepository: {
    getBucketsByRowInRange: vi.fn(),
    getDailyAggregates: vi.fn(),
    getPayInputs: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { AnalyticsTrendsService } from '../analytics-trends.service';
import { analyticsTrendsRepository } from '@/repositories/analytics-trends.repository';

describe('AnalyticsTrendsService', () => {
  let service: AnalyticsTrendsService;

  beforeEach(() => {
    service = new AnalyticsTrendsService();
    vi.clearAllMocks();
  });

  describe('getRowDensity', () => {
    it('returns empty result when no events', async () => {
      vi.mocked(analyticsTrendsRepository.getBucketsByRowInRange).mockResolvedValue([]);

      const result = await service.getRowDensity('orch-1', '2026-03-01', '2026-03-03');
      expect(result.total_buckets).toBe(0);
      expect(result.density_by_row).toEqual([]);
      expect(result.top_rows).toEqual([]);
      expect(result.pending_rows).toEqual([]);
    });

    it('throws on supabase error', async () => {
      vi.mocked(analyticsTrendsRepository.getBucketsByRowInRange).mockRejectedValue(
        new Error('DB error')
      );

      await expect(service.getRowDensity('orch-1', '2026-03-01', '2026-03-03')).rejects.toThrow(
        'DB error'
      );
    });

    it('calculates density correctly with events', async () => {
      const events = [
        { row_number: 1, picker_id: 'p1', scanned_at: '2026-03-01T08:00:00' },
        { row_number: 1, picker_id: 'p1', scanned_at: '2026-03-01T09:00:00' },
        { row_number: 1, picker_id: 'p2', scanned_at: '2026-03-01T09:30:00' },
        { row_number: 2, picker_id: 'p1', scanned_at: '2026-03-01T10:00:00' },
      ];
      vi.mocked(analyticsTrendsRepository.getBucketsByRowInRange).mockResolvedValue(events as any);

      const result = await service.getRowDensity('orch-1', '2026-03-01', '2026-03-03', 100);
      expect(result.total_buckets).toBe(4);
      expect(result.total_rows_harvested).toBe(2);
      expect(result.density_by_row).toHaveLength(2);

      const row1 = result.density_by_row.find(r => r.row_number === 1)!;
      expect(row1.total_buckets).toBe(3);
      expect(row1.unique_pickers).toBe(2);
      expect(row1.target_completion).toBe(3); // 3/100 * 100

      // Row 1 and 2 both below 50% → pending
      expect(result.pending_rows).toContain(1);
      expect(result.pending_rows).toContain(2);
    });

    it('identifies top rows (>=100% completion)', async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        row_number: 5,
        picker_id: `p${i % 3}`,
        scanned_at: `2026-03-01T${String(8 + (i % 8)).padStart(2, '0')}:00:00`,
      }));
      vi.mocked(analyticsTrendsRepository.getBucketsByRowInRange).mockResolvedValue(events as any);

      const result = await service.getRowDensity('orch-1', '2026-03-01', '2026-03-03', 100);
      expect(result.top_rows).toContain(5);
    });
  });

  describe('getDailyBleed', () => {
    it('returns array with correct length (no orchardId)', async () => {
      const result = await service.getDailyBleed(undefined, 5);
      expect(result).toHaveLength(5);
    });

    it('labels last day as Today', async () => {
      const result = await service.getDailyBleed(undefined, 3);
      expect(result[result.length - 1].label).toBe('Today');
    });

    it('returns zeros when no orchardId provided', async () => {
      const result = await service.getDailyBleed(undefined, 7);
      result.forEach(d => expect(d.value).toBe(0));
    });

    it('returns zeros when no settings provided', async () => {
      const result = await service.getDailyBleed('orch-1', 7);
      result.forEach(d => expect(d.value).toBe(0));
    });

    it('computes bleed per picker per day with the unified pay rules', async () => {
      const { analyticsTrendsRepository: repo } = await import('@/repositories/analytics-trends.repository');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
      const now = Date.now();
      const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
      vi.mocked(repo.getPayInputs).mockResolvedValue({
        attendance: [
          // 10 h fichadas hoy → 9.5 h pagables
          { picker_id: 'p1', date: today, check_in: iso(10 * 3600_000), check_out: iso(0), break_start: null, break_minutes: 30 },
        ],
        buckets: [
          ...Array.from({ length: 12 }, () => ({ picker_id: 'p1', scanned_at: iso(0), quality_grade: 'A' })),
          { picker_id: 'p1', scanned_at: iso(0), quality_grade: 'reject' },
        ],
      });

      const result = await service.getDailyBleed('orch-1', 7, 'en-NZ', { piece_rate: 6.5, min_wage_rate: 23.95 });
      expect(result).toHaveLength(7);
      // 9.5 h × 23.95 = 227.53 − 12 × 6.5 = 78 → 149.53 ≈ 150
      expect(result[result.length - 1].value).toBe(150);
    });

    it('all values are non-negative', async () => {
      const result = await service.getDailyBleed(undefined, 7);
      result.forEach(d => expect(d.value).toBeGreaterThanOrEqual(0));
    });
  });
});
