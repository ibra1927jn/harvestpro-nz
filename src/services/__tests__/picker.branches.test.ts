/**
 * Deep branch tests for picker.service.ts — exercises ALL methods and branches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi
  .fn()
  .mockResolvedValue([
    {
      id: 'p1',
      picker_id: 'P-001',
      name: 'Alice',
      status: 'active',
      safety_verified: true,
      current_row: 1,
      team_leader_id: 't1',
      orchard_id: 'o1',
    },
  ]);
const mockGetTotalCount = vi.fn().mockResolvedValue(1);
const mockInsert = vi.fn().mockResolvedValue({ id: 'new' });
const mockUpdateById = vi.fn().mockResolvedValue(undefined);
const mockDeleteById = vi.fn().mockResolvedValue(undefined);
const mockBulkUpdateRow = vi.fn().mockResolvedValue(undefined);
const mockFindDuplicate = vi.fn().mockResolvedValue(null);
const mockInsertBatch = vi.fn().mockResolvedValue([{ id: 'b1' }]);
const mockInsertSingle = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/repositories/picker-crud.repository', () => ({
  pickerCrudRepository: {
    query: (...args: unknown[]) => mockQuery(...args),
    getTotalCount: (...args: unknown[]) => mockGetTotalCount(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    updateById: (...args: unknown[]) => mockUpdateById(...args),
    deleteById: (...args: unknown[]) => mockDeleteById(...args),
    bulkUpdateRow: (...args: unknown[]) => mockBulkUpdateRow(...args),
    findDuplicate: (...args: unknown[]) => mockFindDuplicate(...args),
    insertBatch: (...args: unknown[]) => mockInsertBatch(...args),
    insertSingle: (...args: unknown[]) => mockInsertSingle(...args),
  },
}));

vi.mock('@/repositories/picker.repository', () => ({
  pickerRepository: {},
}));

vi.mock('../optimistic-lock.service', () => ({
  withOptimisticLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/schemas/zod.schemas', () => ({
  PickerSchema: {},
  safeParseArray: (_schema: unknown, data: unknown[]) => data,
}));

import { pickerService } from '../picker.service';
import { withOptimisticLock } from '../optimistic-lock.service';

describe('pickerService — deep branch tests', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getPickersByTeam', () => {
    it('returns mapped pickers (today\'s buckets come from the store, not the broken view)', async () => {
      const result = await pickerService.getPickersByTeam('t1', 'o1');
      expect(result.length).toBe(1);
      expect(result[0].total_buckets_today).toBe(0);
      expect(result[0].avatar).toBe('AL');
    });

    it('handles empty data without the extra diagnostic count', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await pickerService.getPickersByTeam('t1', 'o1');
      expect(result.length).toBe(0);
      expect(mockGetTotalCount).not.toHaveBeenCalled();
    });

    it('handles null picker name', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          id: 'p1',
          picker_id: null,
          name: null,
          status: 'active',
          safety_verified: false,
          current_row: 0,
        },
      ]);
      const result = await pickerService.getPickersByTeam();
      expect(result[0].name).toBe('Unknown');
      expect(result[0].avatar).toBe('??');
    });

    it('leaves out people who left (archived): they cannot be checked in', async () => {
      mockQuery.mockResolvedValueOnce([
        { id: 'p1', picker_id: 'P-001', name: 'Alice', status: 'archived', safety_verified: false },
        { id: 'p2', picker_id: 'P-002', name: 'Bea', status: 'active', safety_verified: true },
      ]);
      const result = await pickerService.getPickersByTeam();
      expect(result.map(p => p.name)).toEqual(['Bea']);
    });
  });

  describe('addPicker', () => {
    it('inserts picker with defaults', async () => {
      await pickerService.addPicker({ name: 'New', picker_id: 'P-999' });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New',
          picker_id: 'P-999',
          status: 'active',
        })
      );
    });
  });

  describe('updatePickerStatus', () => {
    it('uses optimistic lock when expectedUpdatedAt provided', async () => {
      await pickerService.updatePickerStatus('p1', 'break', '2026-01-01');
      expect(vi.mocked(withOptimisticLock)).toHaveBeenCalled();
    });

    it('uses direct update without lock', async () => {
      await pickerService.updatePickerStatus('p1', 'active');
      expect(mockUpdateById).toHaveBeenCalledWith('p1', { status: 'active' });
    });
  });

  describe('deletePicker', () => {
    it('deletes picker by id', async () => {
      await pickerService.deletePicker('p1');
      expect(mockDeleteById).toHaveBeenCalledWith('p1');
    });
  });

  describe('updatePickerRow', () => {
    it('uses optimistic lock when expectedUpdatedAt provided', async () => {
      await pickerService.updatePickerRow('p1', 5, '2026-01-01');
      expect(vi.mocked(withOptimisticLock)).toHaveBeenCalled();
    });

    it('uses direct update without lock', async () => {
      await pickerService.updatePickerRow('p1', 5);
      expect(mockUpdateById).toHaveBeenCalledWith('p1', { current_row: 5 });
    });
  });

  describe('updatePicker', () => {
    it('checks for duplicate picker_id', async () => {
      await pickerService.updatePicker('p1', { picker_id: 'P-NEW' });
      expect(mockFindDuplicate).toHaveBeenCalledWith('P-NEW', 'p1');
    });

    it('throws on duplicate picker_id', async () => {
      mockFindDuplicate.mockResolvedValueOnce({ name: 'Existing' });
      await expect(pickerService.updatePicker('p1', { picker_id: 'P-DUP' })).rejects.toThrow(
        'already assigned'
      );
    });

    it('strips read-only fields before update', async () => {
      await pickerService.updatePicker('p1', { name: 'Updated', id: 'x', qcStatus: [1] as any });
      const updateCall = mockUpdateById.mock.calls[0][1];
      expect(updateCall.id).toBeUndefined();
      expect(updateCall.qcStatus).toBeUndefined();
      expect(updateCall.name).toBe('Updated');
    });

    it('uses optimistic lock when expectedUpdatedAt provided', async () => {
      await pickerService.updatePicker('p1', { name: 'Updated' }, '2026-01-01');
      expect(vi.mocked(withOptimisticLock)).toHaveBeenCalled();
    });
  });

  describe('addPickersBulk', () => {
    it('batch inserts pickers', async () => {
      const result = await pickerService.addPickersBulk([{ name: 'Alice' }, { name: 'Bob' }], 'o1');
      expect(result.created).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('falls back to individual inserts on batch failure', async () => {
      mockInsertBatch.mockRejectedValueOnce(new Error('Batch failed'));
      const result = await pickerService.addPickersBulk([{ name: 'Alice' }], 'o1');
      expect(result.created).toBe(1);
    });

    it('handles individual insert errors in fallback', async () => {
      mockInsertBatch.mockRejectedValueOnce(new Error('Batch failed'));
      mockInsertSingle.mockResolvedValueOnce({ error: { message: 'duplicate' } });
      const result = await pickerService.addPickersBulk([{ name: 'Alice' }], 'o1');
      expect(result.skipped).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('handles individual insert exceptions in fallback', async () => {
      mockInsertBatch.mockRejectedValueOnce(new Error('Batch failed'));
      mockInsertSingle.mockRejectedValueOnce(new Error('connection lost'));
      const result = await pickerService.addPickersBulk([{ name: 'Alice' }], 'o1');
      expect(result.skipped).toBe(1);
      expect(result.errors[0]).toContain('connection lost');
    });
  });

  describe('assignRowToPickers', () => {
    it('calls bulkUpdateRow', async () => {
      await pickerService.assignRowToPickers(['p1', 'p2'], 5);
      expect(mockBulkUpdateRow).toHaveBeenCalledWith(['p1', 'p2'], 5);
    });
  });
});
