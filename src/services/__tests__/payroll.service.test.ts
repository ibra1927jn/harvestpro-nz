// =============================================
// PAYROLL SERVICE TESTS
// =============================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock supabase BEFORE importing the service
// (cada test sustituye supabase.from con su propia cadena de resultados)
vi.mock('@/services/supabase', () => ({
    supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-02-13',
}));

const { mockEdgeInvoke } = vi.hoisted(() => ({ mockEdgeInvoke: vi.fn() }));
vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: mockEdgeInvoke },
}));

import { payrollService, type PayrollResult } from '../payroll.service';
import { supabase } from '../supabase';

// =============================================
// TEST DATA
// =============================================


const MOCK_PAYROLL_RESULT: PayrollResult = {
    orchard_id: 'orchard-001',
    date_range: { start: '2026-02-13', end: '2026-02-13' },
    summary: {
        total_buckets: 240,
        total_hours: 80,
        total_piece_rate_earnings: 1560.00,
        // total_top_up: Sarah(126.60) + otros workers. Antes era 82.00 con $23.50/hr (8h*23.50=188).
        // Con $23.95/hr: Sarah minimum = 8*23.95=191.60 → top_up = 191.60-65.00=126.60. Delta = +3.60
        total_top_up: 85.60,
        total_earnings: 1645.60,
    },
    compliance: {
        workers_below_minimum: 2,
        workers_total: 10,
        compliance_rate: 80.0,
    },
    picker_breakdown: [
        {
            picker_id: 'pk-001',
            picker_name: 'James Wilson',
            buckets: 30,
            hours_worked: 8,
            piece_rate_earnings: 195.00,
            hourly_rate: 24.38,
            minimum_required: 191.60, // 8h * $23.95/hr (Minimum Wage Order 2026)
            top_up_required: 0,
            total_earnings: 195.00,
            is_below_minimum: false,
        },
        {
            picker_id: 'pk-002',
            picker_name: 'Sarah Chen',
            buckets: 10,
            hours_worked: 8,
            piece_rate_earnings: 65.00,
            hourly_rate: 8.13,
            minimum_required: 191.60, // 8h * $23.95/hr
            top_up_required: 126.60,  // 191.60 - 65.00
            total_earnings: 191.60,   // top-up brings to minimum floor
            is_below_minimum: true,
        },
    ],
    settings: {
        bucket_rate: 6.50,
        min_wage_rate: 23.95,
    },
};

const MOCK_ATTENDANCE_DATA = [
    {
        id: 'att-001',
        picker_id: 'pk-001',
        date: '2026-02-13',
        check_in: '2026-02-13T07:00:00+13:00',
        check_out: '2026-02-13T15:00:00+13:00',
        hours_worked: 8,
        verified_by: 'manager-001',
        orchard_id: 'orchard-001',
    },
    {
        id: 'att-002',
        picker_id: 'pk-002',
        date: '2026-02-13',
        check_in: '2026-02-13T08:00:00+13:00',
        check_out: null,
        hours_worked: 0,
        verified_by: null,
        orchard_id: 'orchard-001',
    },
];

const MOCK_PICKERS_DATA = [
    { id: 'pk-001', name: 'James Wilson' },
    { id: 'pk-002', name: 'Sarah Chen' },
];

// =============================================
// TESTS
// =============================================

describe('Payroll Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEdgeInvoke.mockReset();
    });

    // =============================================
    // calculatePayroll
    // =============================================
    describe('calculatePayroll', () => {
        it('should call edgeFunctionsRepository.invoke with correct params', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            await payrollService.calculatePayroll('orchard-001', '2026-02-10', '2026-02-13');

            expect(mockEdgeInvoke).toHaveBeenCalledWith(
                'calculate-payroll',
                {
                    orchard_id: 'orchard-001',
                    start_date: '2026-02-10',
                    end_date: '2026-02-13',
                }
            );
        });

        it('should return payroll result on success', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');

            expect(result.summary.total_earnings).toBe(1645.60);
            expect(result.compliance.workers_below_minimum).toBe(2);
            expect(result.picker_breakdown).toHaveLength(2);
        });

        it('should throw on edge function error', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: null, error: { message: 'Invalid date range' },
            });

            await expect(
                payrollService.calculatePayroll('orchard-001', '2026-02-15', '2026-02-10')
            ).rejects.toThrow('Invalid date range');
        });

        it('should throw generic error when edge function returns no message', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: null, error: { message: 'Edge Function calculate-payroll failed' },
            });

            await expect(
                payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13')
            ).rejects.toThrow();
        });
    });

    // =============================================
    // Compliance validation
    // =============================================
    describe('NZ Employment Compliance', () => {
        it('should identify workers below minimum wage', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');

            const sarahBreakdown = result.picker_breakdown.find(p => p.picker_id === 'pk-002');
            expect(sarahBreakdown?.is_below_minimum).toBe(true);
            expect(sarahBreakdown?.top_up_required).toBeGreaterThan(0);
            expect(sarahBreakdown?.total_earnings).toBeGreaterThanOrEqual(
                sarahBreakdown!.hours_worked * result.settings.min_wage_rate
            );
        });

        it('should not flag workers above minimum wage', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');

            const jamesBreakdown = result.picker_breakdown.find(p => p.picker_id === 'pk-001');
            expect(jamesBreakdown?.is_below_minimum).toBe(false);
            expect(jamesBreakdown?.top_up_required).toBe(0);
        });

        it('should calculate compliance rate correctly', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');

            expect(result.compliance.compliance_rate).toBe(80.0);
            expect(result.compliance.workers_below_minimum).toBe(2);
            expect(result.compliance.workers_total).toBe(10);
        });
    });

    // =============================================
    // calculateToday
    // =============================================
    describe('calculateToday', () => {
        it('should use today NZST as date range', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            await payrollService.calculateToday('orchard-001');

            expect(mockEdgeInvoke).toHaveBeenCalledWith(
                'calculate-payroll',
                {
                    orchard_id: 'orchard-001',
                    start_date: '2026-02-13',
                    end_date: '2026-02-13',
                }
            );
        });
    });

    // =============================================
    // getDashboardSummary
    // =============================================
    describe('getDashboardSummary', () => {
        it('should return simplified summary', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: MOCK_PAYROLL_RESULT, error: null,
            });

            const summary = await payrollService.getDashboardSummary('orchard-001');

            expect(summary).toEqual({
                totalBuckets: 240,
                totalCost: 1645.60,
                workersAtRisk: 2,
                complianceRate: 80.0,
            });
        });
    });

    // =============================================
    // fetchTimesheets
    // =============================================
    describe('fetchTimesheets', () => {
        const createMockFrom = (attendanceResponse: unknown, pickersResponse: unknown) => {
            let callCount = 0;
            return vi.fn(() => {
                callCount++;
                if (callCount === 1) {
                    // First call: daily_attendance
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    is: () => ({
                                        order: () => Promise.resolve(attendanceResponse),
                                    }),
                                }),
                            }),
                        }),
                    };
                } else {
                    // Second call: pickers
                    // fetchPickerNames va por trozos y paginado: .in().order().range()
                    return {
                        select: () => ({
                            in: () => ({
                                order: () => ({
                                    range: () => Promise.resolve(pickersResponse),
                                }),
                            }),
                        }),
                    };
                }
            });
        };

        it('should fetch and format timesheets correctly', async () => {
            (supabase.from as Mock) = createMockFrom(
                { data: MOCK_ATTENDANCE_DATA, error: null },
                { data: MOCK_PICKERS_DATA, error: null }
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001', '2026-02-13');

            expect(timesheets).toHaveLength(2);
            expect(timesheets[0].picker_name).toBe('James Wilson');
            expect(timesheets[0].is_verified).toBe(true);
        });

        it('should calculate hours worked correctly', async () => {
            (supabase.from as Mock) = createMockFrom(
                { data: MOCK_ATTENDANCE_DATA, error: null },
                { data: MOCK_PICKERS_DATA, error: null }
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001');

            // 07:00 to 15:00 = 8 hours
            expect(timesheets[0].hours_worked).toBe(8); // sin descanso anotado: no se descuenta
        });

        it('should return 0 hours when check_out is null', async () => {
            (supabase.from as Mock) = createMockFrom(
                { data: MOCK_ATTENDANCE_DATA, error: null },
                { data: MOCK_PICKERS_DATA, error: null }
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001');

            // No checkout = 0 hours
            expect(timesheets[1].hours_worked).toBe(0);
            expect(timesheets[1].is_verified).toBe(false);
        });

        it('caps an uncorrected shift over 14 h at 14 h and flags it; corrected, pays it all (ronda 24-10)', async () => {
            const longShiftData = [{
                ...MOCK_ATTENDANCE_DATA[0],
                check_in: '2026-02-13T04:00:00+13:00',
                check_out: '2026-02-13T20:00:00+13:00', // 16h shift
                hours_worked: 16,
            }];

            (supabase.from as Mock) = createMockFrom(
                { data: longShiftData, error: null },
                { data: MOCK_PICKERS_DATA, error: null }
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001');
            // Antes (L14) no se cortaba; ahora sin corregir se pagan 14 h y no se aprueba
            expect(timesheets[0].hours_worked).toBe(14);
            expect(timesheets[0].requires_review).toBe(true);
            expect(timesheets[0].long_shift).toBe(true);

            (supabase.from as Mock) = createMockFrom(
                { data: [{ ...longShiftData[0], corrected_at: '2026-02-14T00:00:00Z' }], error: null },
                { data: MOCK_PICKERS_DATA, error: null }
            );
            const fixed = await payrollService.fetchTimesheets('orchard-001');
            expect(fixed[0].hours_worked).toBe(16); // sin descanso anotado
            expect(fixed[0].long_shift).toBeUndefined();
        });

        it('should return empty array on database error', async () => {
            (supabase.from as Mock) = createMockFrom(
                { data: null, error: { message: 'Connection failed' } },
                { data: null, error: null }
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001');
            expect(timesheets).toEqual([]);
        });

        it('should handle unknown pickers gracefully', async () => {
            (supabase.from as Mock) = createMockFrom(
                { data: MOCK_ATTENDANCE_DATA, error: null },
                { data: [], error: null } // No picker names found
            );

            const timesheets = await payrollService.fetchTimesheets('orchard-001');

            expect(timesheets[0].picker_name).toBe('Unknown');
        });
    });

    // =============================================
    // approveTimesheet — via Edge Function
    // =============================================
    describe('approveTimesheet', () => {
        it('should approve timesheet via Edge Function', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: { success: true, attendance_id: 'att-001', picker_id: 'pk-001', verified_by: 'manager-001', updated_at: '2026-02-13T18:00:00Z' },
                error: null,
            });

            const result = await payrollService.approveTimesheet('att-001', 'manager-001');

            expect(mockEdgeInvoke).toHaveBeenCalledWith('approve-timesheet', {
                attendance_id: 'att-001',
                verified_by: 'manager-001',
                current_updated_at: undefined,
            });
            expect(result.success).toBe(true);
            expect(result.attendance_id).toBe('att-001');
        });

        it('should pass currentUpdatedAt for optimistic locking', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: { success: true, attendance_id: 'att-001', updated_at: '2026-02-13T18:00:00Z' },
                error: null,
            });

            await payrollService.approveTimesheet('att-001', 'manager-001', '2026-02-13T17:00:00Z');

            expect(mockEdgeInvoke).toHaveBeenCalledWith('approve-timesheet', {
                attendance_id: 'att-001',
                verified_by: 'manager-001',
                current_updated_at: '2026-02-13T17:00:00Z',
            });
        });

        it('should throw on Edge Function error', async () => {
            mockEdgeInvoke.mockResolvedValue({
                data: null,
                error: { message: 'Stale data — timesheet was updated by another user' },
            });

            await expect(
                payrollService.approveTimesheet('att-001', 'manager-001', 'old-timestamp')
            ).rejects.toThrow('Stale data');
        });
    });

    // =============================================
    // NZ Minimum Wage Boundary Tests ($23.95)
    // =============================================
    describe('NZ Minimum Wage Edge Cases', () => {
        it('should NOT flag picker earning exactly $23.95/hr (boundary)', async () => {
            const boundaryResult: PayrollResult = {
                ...MOCK_PAYROLL_RESULT,
                picker_breakdown: [{
                    picker_id: 'pk-boundary',
                    picker_name: 'Boundary Worker',
                    // 30 buckets * $6.50 = $195.00 > minimum floor $191.60 (8h * $23.95)
                    buckets: 30,
                    hours_worked: 8,
                    piece_rate_earnings: 195.00,
                    hourly_rate: 24.375,
                    minimum_required: 191.60, // 8h * $23.95
                    top_up_required: 0,
                    total_earnings: 195.00,
                    is_below_minimum: false,
                }],
                settings: { bucket_rate: 6.50, min_wage_rate: 23.95 },
            };

            mockEdgeInvoke.mockResolvedValue({
                data: boundaryResult, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');
            const worker = result.picker_breakdown[0];

            expect(worker.is_below_minimum).toBe(false);
            expect(worker.top_up_required).toBe(0);
            expect(worker.piece_rate_earnings).toBeGreaterThanOrEqual(
                worker.hours_worked * result.settings.min_wage_rate
            );
        });

        it('should handle configurable min_wage_rate from settings', async () => {
            const futureWageResult: PayrollResult = {
                ...MOCK_PAYROLL_RESULT,
                settings: { bucket_rate: 6.50, min_wage_rate: 24.00 },
                picker_breakdown: [{
                    picker_id: 'pk-future',
                    picker_name: 'Future Worker',
                    buckets: 29,
                    hours_worked: 8,
                    piece_rate_earnings: 188.50,
                    hourly_rate: 23.5625,
                    minimum_required: 192.00,
                    top_up_required: 3.50,
                    total_earnings: 192.00,
                    is_below_minimum: true,
                }],
            };

            mockEdgeInvoke.mockResolvedValue({
                data: futureWageResult, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');
            const worker = result.picker_breakdown[0];

            expect(worker.is_below_minimum).toBe(true);
            expect(worker.top_up_required).toBe(3.50);
            expect(result.settings.min_wage_rate).toBe(24.00);
        });

        it('should handle zero-bucket picker correctly', async () => {
            const zeroResult: PayrollResult = {
                ...MOCK_PAYROLL_RESULT,
                picker_breakdown: [{
                    picker_id: 'pk-zero',
                    picker_name: 'Zero Picker',
                    buckets: 0,
                    hours_worked: 8,
                    piece_rate_earnings: 0,
                    hourly_rate: 0,
                    minimum_required: 191.60, // 8h * $23.95
                    top_up_required: 191.60,  // full minimum (0 piece-rate)
                    total_earnings: 191.60,
                    is_below_minimum: true,
                }],
            };

            mockEdgeInvoke.mockResolvedValue({
                data: zeroResult, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');
            const worker = result.picker_breakdown[0];

            expect(worker.buckets).toBe(0);
            expect(worker.is_below_minimum).toBe(true);
            expect(worker.top_up_required).toBe(191.60);
            expect(worker.total_earnings).toBe(191.60);
        });

        it('should handle high-volume picker (450+ buckets/day)', async () => {
            const highVolumeResult: PayrollResult = {
                ...MOCK_PAYROLL_RESULT,
                picker_breakdown: [{
                    picker_id: 'pk-star',
                    picker_name: 'Star Picker',
                    buckets: 450,
                    hours_worked: 10,
                    piece_rate_earnings: 2925.00,
                    hourly_rate: 292.50,
                    minimum_required: 239.50, // 10h * $23.95
                    top_up_required: 0,
                    total_earnings: 2925.00,
                    is_below_minimum: false,
                }],
            };

            mockEdgeInvoke.mockResolvedValue({
                data: highVolumeResult, error: null,
            });

            const result = await payrollService.calculatePayroll('orchard-001', '2026-02-13', '2026-02-13');
            const worker = result.picker_breakdown[0];

            expect(worker.is_below_minimum).toBe(false);
            expect(worker.piece_rate_earnings).toBe(2925.00);
            expect(worker.total_earnings).toBe(worker.piece_rate_earnings);
        });
    });
});


