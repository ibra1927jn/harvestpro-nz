/**
 * ============================================
 * attendance.service.test.ts
 * Tests for attendance management functions
 *
 * Uses vi.spyOn on repositories for mocking.
 * ============================================
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: vi.fn(() => '2024-12-15'),
    nowNZST: vi.fn(() => '2024-12-15T09:00:00'),
}));

import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { attendanceService } from '../attendance.service';

describe('attendanceService', () => {
    let mockInvoke: ReturnType<typeof vi.spyOn>;
    let mockGetDailyWithPickers: ReturnType<typeof vi.spyOn>;
    let mockGetByDateWithPickers: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockInvoke = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({ data: null, error: null });
        mockGetDailyWithPickers = vi.spyOn(attendanceRepository, 'getDailyWithPickers').mockResolvedValue([]);
        mockGetByDateWithPickers = vi.spyOn(attendanceRepository, 'getByDateWithPickers').mockResolvedValue([]);
    });

    // ═══════════════════════════════
    // getDailyAttendance (read-only, via repository)
    // ═══════════════════════════════
    describe('getDailyAttendance', () => {
        it('fetches attendance for given orchard and date', async () => {
            const mockData = [
                { id: 'att-1', picker_id: 'p-1', status: 'present', picker: { name: 'Alice', role: 'picker' } },
                { id: 'att-2', picker_id: 'p-2', status: 'present', picker: { name: 'Bob', role: 'picker' } },
            ];
            mockGetDailyWithPickers.mockResolvedValue(mockData);

            const result = await attendanceService.getDailyAttendance('orchard-1', '2024-12-15');

            expect(mockGetDailyWithPickers).toHaveBeenCalledWith('orchard-1', '2024-12-15');
            expect(result).toEqual(mockData);
            expect(result).toHaveLength(2);
        });

        it('uses todayNZST when no date provided', async () => {
            mockGetDailyWithPickers.mockResolvedValue([]);

            await attendanceService.getDailyAttendance('orchard-1');

            expect(mockGetDailyWithPickers).toHaveBeenCalledWith('orchard-1', '2024-12-15');
        });

        it('returns result from repository', async () => {
            mockGetDailyWithPickers.mockResolvedValue(null);

            const result = await attendanceService.getDailyAttendance('orchard-1');
            expect(result).toBeNull();
        });
    });

    // ═══════════════════════════════
    // checkInPicker — via Edge Function
    // ═══════════════════════════════
    describe('checkInPicker', () => {
        it('returns result from manage-attendance Edge Function', async () => {
            const edgeResult = {
                picker_id: 'p-1',
                status: 'present',
                id: 'att-1',
                already_checked_in: false,
            };
            mockInvoke.mockResolvedValue({ data: edgeResult, error: null });

            const result = await attendanceService.checkInPicker('p-1', 'orchard-1', 'admin-1');

            expect(mockInvoke).toHaveBeenCalledWith('manage-attendance', {
                action: 'check_in',
                picker_id: 'p-1',
                orchard_id: 'orchard-1',
                verified_by: 'admin-1',
            });
            expect(result).toEqual(edgeResult);
        });

        it('returns already_checked_in flag for duplicate check-in', async () => {
            mockInvoke.mockResolvedValue({
                data: { picker_id: 'p-1', status: 'present', id: 'existing-att-1', already_checked_in: true },
                error: null,
            });

            const result = await attendanceService.checkInPicker('p-1', 'orchard-1');
            expect(result!.already_checked_in).toBe(true);
        });

        it('throws on Edge Function error', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: { message: 'Insufficient permissions' } });

            await expect(attendanceService.checkInPicker('p-1', 'orchard-1')).rejects.toThrow('Insufficient permissions');
        });
    });

    // ═══════════════════════════════
    // checkOutPicker — via Edge Function
    // ═══════════════════════════════
    describe('checkOutPicker', () => {
        it('returns checkout result from Edge Function', async () => {
            const edgeResult = {
                id: 'att-1',
                picker_id: 'p-1',
                check_out: '2024-12-15T17:00:00',
                hours_worked: 8,
            };
            mockInvoke.mockResolvedValue({ data: edgeResult, error: null });

            const result = await attendanceService.checkOutPicker('att-1');

            expect(mockInvoke).toHaveBeenCalledWith('manage-attendance', {
                action: 'check_out',
                attendance_id: 'att-1',
            });
            expect(result).toEqual(edgeResult);
        });

        it('throws on Edge Function error', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: { message: 'Attendance record not found' } });

            await expect(attendanceService.checkOutPicker('bad-id')).rejects.toThrow('Attendance record not found');
        });
    });

    // ═══════════════════════════════
    // getAttendanceByDate (read-only)
    // ═══════════════════════════════
    describe('getAttendanceByDate', () => {
        it('fetches attendance for any given date', async () => {
            const mockData = [
                { id: 'att-1', picker: { id: 'p-1', name: 'Alice' }, check_in: '09:00' },
            ];
            mockGetByDateWithPickers.mockResolvedValue(mockData);

            const result = await attendanceService.getAttendanceByDate('orchard-1', '2024-12-10');

            expect(mockGetByDateWithPickers).toHaveBeenCalledWith('orchard-1', '2024-12-10');
            expect(result).toEqual(mockData);
        });

        it('returns result from repository', async () => {
            mockGetByDateWithPickers.mockResolvedValue([]);

            const result = await attendanceService.getAttendanceByDate('orchard-1', '2024-12-10');
            expect(result).toEqual([]);
        });
    });

    // ═══════════════════════════════
    // correctAttendance — via Edge Function
    // ═══════════════════════════════
    describe('correctAttendance', () => {
        it('sends correction to Edge Function with audit trail', async () => {
            mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

            await attendanceService.correctAttendance(
                'att-1',
                { check_in: '08:30:00' },
                'Late arrival correction',
                'admin-1'
            );

            expect(mockInvoke).toHaveBeenCalledWith('manage-attendance', {
                action: 'correct',
                attendance_id: 'att-1',
                check_in: '08:30:00',
                check_out: undefined,
                reason: 'Late arrival correction',
                admin_id: 'admin-1',
            });
        });

        it('throws on Edge Function error', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: { message: 'RLS violation' } });

            await expect(
                attendanceService.correctAttendance(
                    'att-1',
                    { check_out: '17:30:00' },
                    'Early departure',
                    'admin-1'
                )
            ).rejects.toThrow('RLS violation');
        });
    });

    // ═══════════════════════════════
    // correctAttendanceBatch — via Edge Function (correct_batch)
    // ═══════════════════════════════
    describe('correctAttendanceBatch', () => {
        const response = {
            success: false, total: 2, succeeded: 1, failed: 1,
            results: [
                { index: 0, attendance_id: 'att-1', success: true },
                { index: 1, attendance_id: 'att-2', success: false, error: 'Not allowed to correct this timesheet' },
            ],
        };

        it('sends every item with only the fields that have a value, one reason for the batch', async () => {
            mockInvoke.mockResolvedValue({ data: response, error: null });

            const result = await attendanceService.correctAttendanceBatch(
                [
                    { attendance_id: 'att-1', check_out: '2026-10-21T03:30:00.000Z', break_start: undefined },
                    { attendance_id: 'att-2', check_in: '2026-10-20T18:00:00.000Z', break_start: null },
                ],
                'Everyone forgot to check out',
                'tl-1'
            );

            expect(mockInvoke).toHaveBeenCalledWith('manage-attendance', {
                action: 'correct_batch',
                items: [
                    { attendance_id: 'att-1', check_out: '2026-10-21T03:30:00.000Z' },
                    { attendance_id: 'att-2', check_in: '2026-10-20T18:00:00.000Z', break_start: null },
                ],
                reason: 'Everyone forgot to check out',
                admin_id: 'tl-1',
            });
            // Resultados por fichaje: el que falla no tira el lote
            expect(result.succeeded).toBe(1);
            expect(result.failed).toBe(1);
            expect(result.results[1].error).toContain('Not allowed');
        });

        it('does not call the server for an empty batch and refuses more than 200 items', async () => {
            mockInvoke.mockClear();
            const empty = await attendanceService.correctAttendanceBatch([], 'Nothing', 'tl-1');
            expect(empty.total).toBe(0);
            expect(mockInvoke).not.toHaveBeenCalled();

            const tooMany = Array.from({ length: 201 }, (_, i) => ({ attendance_id: `att-${i}` }));
            await expect(attendanceService.correctAttendanceBatch(tooMany, 'Bulk fix', 'tl-1')).rejects.toThrow('At most 200');
            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('throws on Edge Function error and on a malformed response', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: { message: 'Function unavailable' } });
            await expect(
                attendanceService.correctAttendanceBatch([{ attendance_id: 'att-1', check_out: 'x' }], 'Reason here', 'tl-1')
            ).rejects.toThrow('Function unavailable');

            mockInvoke.mockResolvedValue({ data: { nope: true }, error: null });
            await expect(
                attendanceService.correctAttendanceBatch([{ attendance_id: 'att-1', check_out: 'x' }], 'Reason here', 'tl-1')
            ).rejects.toThrow('Invalid correctAttendanceBatch response');
        });
    });
});


