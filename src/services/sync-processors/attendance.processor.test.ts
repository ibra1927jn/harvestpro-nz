/**
 * attendance.processor.test.ts — Unit tests
 *
 * Uses vi.spyOn(supabase, 'from') with full chain mock.
 * Tests check-in (delegates to attendanceService) and check-out (optimistic lock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import { attendanceService } from '../attendance.service';
import { conflictService } from '../conflict.service';

// We spy on the actual service and lock functions
describe('processAttendance', () => {
  let processAttendance: typeof import('./attendance.processor').processAttendance;

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Dynamically import to get fresh reference
    const mod = await import('./attendance.processor');
    processAttendance = mod.processAttendance;
  });

  describe('check-in', () => {
    it('delegates to attendanceService.checkInPicker', async () => {
      const checkInSpy = vi
        .spyOn(attendanceService, 'checkInPicker')
        .mockResolvedValue(undefined as never);

      await processAttendance({
        picker_id: 'p-1',
        orchard_id: 'o-1',
        verifiedBy: 'tl-1',
      });

      expect(checkInSpy).toHaveBeenCalledWith('p-1', 'o-1', 'tl-1');
    });
  });

  describe('check-out (optimistic lock)', () => {
    function setupMocks(checkInTime: string, lockSuccess = true) {
      // Mock supabase.from for the check_in lookup
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { check_in: checkInTime },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: lockSuccess ? { id: 'att-1' } : null,
                  error: lockSuccess ? null : null,
                }),
              }),
            }),
          }),
        }),
      } as never);
    }

    it('calls withOptimisticLock for check-out', async () => {
      setupMocks('2026-03-04T07:00:00Z');
      const lockSpy = vi
        .spyOn(await import('../optimistic-lock.service'), 'withOptimisticLock')
        .mockResolvedValue({ success: true } as never);

      await processAttendance(
        {
          picker_id: 'p-1',
          orchard_id: 'o-1',
          check_out: '2026-03-04T15:00:00Z',
          attendanceId: 'att-1',
        },
        '2026-03-04T07:00:00Z'
      );

      expect(lockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'daily_attendance',
          recordId: 'att-1',
          updates: expect.objectContaining({
            check_out: '2026-03-04T15:00:00Z',
            status: 'present',
          }),
        })
      );
    });

    it('calculates hours_worked correctly (8h)', async () => {
      setupMocks('2026-03-04T07:00:00Z');
      const lockSpy = vi
        .spyOn(await import('../optimistic-lock.service'), 'withOptimisticLock')
        .mockResolvedValue({ success: true } as never);

      await processAttendance(
        {
          picker_id: 'p-1',
          orchard_id: 'o-1',
          check_out: '2026-03-04T15:00:00Z',
          attendanceId: 'att-1',
        },
        '2026-03-04T06:00:00Z'
      );

      expect(lockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.objectContaining({ hours_worked: 8 }), // 8 h, sin descanso anotado (no se descuenta)
        })
      );
    });

    it('prevents negative hours (Math.max(0))', async () => {
      setupMocks('2026-03-04T15:00:00Z');
      const lockSpy = vi
        .spyOn(await import('../optimistic-lock.service'), 'withOptimisticLock')
        .mockResolvedValue({ success: true } as never);

      await processAttendance(
        {
          picker_id: 'p-1',
          orchard_id: 'o-1',
          check_out: '2026-03-04T07:00:00Z',
          attendanceId: 'att-1',
        },
        '2026-03-04T14:00:00Z'
      );

      expect(lockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.objectContaining({ hours_worked: 0 }),
        })
      );
    });

    it('auto-resuelve como keep_server en conflicto de lock (no lanza — política de nómina)', async () => {
      setupMocks('2026-03-04T07:00:00Z');
      const fakeConflict = { id: 'conflict-1', table: 'daily_attendance', record_id: 'att-1' };
      vi.spyOn(await import('../optimistic-lock.service'), 'withOptimisticLock').mockResolvedValue({
        success: false,
        conflict: fakeConflict,
      } as never);

      const resolveSpy = vi.spyOn(conflictService, 'resolve').mockResolvedValue(null);

      // No debe lanzar — server-wins es política de nómina
      await expect(
        processAttendance(
          {
            picker_id: 'p-1',
            orchard_id: 'o-1',
            check_out: '2026-03-04T15:00:00Z',
            attendanceId: 'att-1',
          },
          '2026-03-04T07:00:00Z'
        )
      ).resolves.toBeUndefined();

      // Debe haber registrado la resolución para auditoría
      expect(resolveSpy).toHaveBeenCalledWith('conflict-1', 'keep_server');
    });
  });
});
