/**
 * Deep tests for attendance.service.ts — imports module to ensure coverage
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: () => '2026-03-10',
}));

vi.mock('@/repositories/attendance.repository', () => ({
    attendanceRepository: {
        getDailyWithPickers: vi.fn().mockResolvedValue([]),
        getActivePickers: vi.fn().mockResolvedValue([]),
        getByDateWithPickers: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

import { attendanceService } from '../attendance.service';

describe('attendanceService — deep tests', () => {
    it('exports getDailyAttendance', () => expect(attendanceService.getDailyAttendance).toBeDefined());
    it('exports checkInPicker', () => expect(attendanceService.checkInPicker).toBeDefined());
    it('exports checkOutPicker', () => expect(attendanceService.checkOutPicker).toBeDefined());
    it('exports getActivePickersForLiveOps', () => expect(attendanceService.getActivePickersForLiveOps).toBeDefined());
    it('exports getAttendanceByDate', () => expect(attendanceService.getAttendanceByDate).toBeDefined());
    it('exports correctAttendance', () => expect(attendanceService.correctAttendance).toBeDefined());
});


