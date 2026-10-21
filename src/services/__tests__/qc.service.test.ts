/**
 * qc.service.test.ts — Unit tests for Quality Control service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
  todayNZST: vi.fn(() => '2026-03-04'),
  toNZST: vi.fn((d: Date) => d.toISOString()),
  nzMidnight: vi.fn((d: string) => `${d}T00:00:00+13:00`),
  nzEndOfDay: vi.fn((d: string) => `${d}T23:59:59.999+13:00`),
}));

vi.mock('../sync.service', () => ({
  syncService: { addToQueue: vi.fn() },
}));

import { supabase } from '../supabase';
import { qcService } from '../qc.service';
import { syncService } from '../sync.service';

describe('qcService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('logInspection', () => {
    it('inserts inspection and returns data on success', async () => {
      const mockInspection = {
        id: 'insp-1',
        orchard_id: 'o-1',
        picker_id: 'p-1',
        inspector_id: 'i-1',
        grade: 'A',
        created_at: '2026-03-04',
      };
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockInspection, error: null }),
          }),
        }),
      } as never);

      const result = await qcService.logInspection({
        orchardId: 'o-1',
        pickerId: 'p-1',
        inspectorId: 'i-1',
        grade: 'A',
      });

      expect(result).toEqual(mockInspection);
    });

    it('queues for offline sync on network failure', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Failed to fetch' },
            }),
          }),
        }),
      } as never);

      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const result = await qcService.logInspection({
        orchardId: 'o-1',
        pickerId: 'p-1',
        inspectorId: 'i-1',
        grade: 'B',
      });

      expect(syncService.addToQueue).toHaveBeenCalledWith('QC_INSPECTION', expect.any(Object));
      expect(result?.id).toMatch(/^pending-/);

      // Restore
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('returns null on non-network error', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'RLS violation' },
            }),
          }),
        }),
      } as never);

      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      const result = await qcService.logInspection({
        orchardId: 'o-1',
        pickerId: 'p-1',
        inspectorId: 'i-1',
        grade: 'C',
      });

      expect(result).toBeNull();
    });
  });

  describe('getInspections', () => {
    it('returns inspections for given date', async () => {
      const mockData = [
        { id: 'i1', grade: 'A' },
        { id: 'i2', grade: 'B' },
      ];
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await qcService.getInspections('o-1', '2026-03-04');
      expect(result).toHaveLength(2);
    });

    it('returns empty array on error', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'error' },
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await qcService.getInspections('o-1');
      expect(result).toEqual([]);
    });
  });

  describe('getGradeDistribution', () => {
    it('computes correct distribution from inspections', async () => {
      const mockData = [
        { grade: 'A' },
        { grade: 'A' },
        { grade: 'A' },
        { grade: 'B' },
        { grade: 'B' },
        { grade: 'C' },
        { grade: 'reject' },
      ];
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
              }),
            }),
          }),
        }),
      } as never);

      const dist = await qcService.getGradeDistribution('o-1');
      expect(dist.A).toBe(3);
      expect(dist.B).toBe(2);
      expect(dist.C).toBe(1);
      expect(dist.reject).toBe(1);
      expect(dist.total).toBe(7);
    });

    it('returns zeroes when no inspections', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      } as never);

      const dist = await qcService.getGradeDistribution('o-1');
      expect(dist).toEqual({ A: 0, B: 0, C: 0, reject: 0, total: 0 });
    });
  });

  describe('getPickerInspections', () => {
    it('returns limited inspections for a picker', async () => {
      const mockData = [{ id: 'i1' }];
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
            }),
          }),
        }),
      } as never);

      const result = await qcService.getPickerInspections('p-1', 10);
      expect(result).toEqual(mockData);
    });

    it('returns empty array on error', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'err' },
              }),
            }),
          }),
        }),
      } as never);

      const result = await qcService.getPickerInspections('p-1');
      expect(result).toEqual([]);
    });
  });
});
