/**
 * DayClosureButton.test.tsx
 * Integration tests for the day closure workflow
 * 
 * Tests cover:
 * - Initial render (button text, enabled state)
 * - Click triggers payroll calculation and shows confirmation modal
 * - Confirmation modal displays summary data correctly
 * - Confirm closure inserts to Supabase and updates store
 * - Cancel closes the confirmation modal
 * - Error handling for payroll fetch failure
 * - Error handling for Supabase insert failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayClosureButton } from './DayClosureButton';
import type { PayrollResult } from '@/services/payroll.service';

// ── Mock data ──────────────────────────────
const mockPayrollResult: PayrollResult = {
    orchard_id: 'orchard-1',
    date_range: { start: '2026-02-14', end: '2026-02-14' },
    picker_breakdown: [],
    settings: { bucket_rate: 5.00, min_wage_rate: 23.95 },
    summary: {
        total_buckets: 320,
        total_hours: 48.5,
        total_piece_rate_earnings: 1600.00,
        total_top_up: 250.00,
        total_earnings: 1850.00,
    },
    compliance: {
        workers_total: 12,
        workers_below_minimum: 3,
        compliance_rate: 75.0,
    },
};

// ── Mock store state ───────────────────────
const mockFetchGlobalData = vi.fn().mockResolvedValue(undefined);
const mockSetDayClosed = vi.fn();

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (state: Record<string, unknown>) => unknown) => {
        const state = {
            orchard: { id: 'orchard-1', name: 'Te Puke Orchard' },
            currentUser: { id: 'user-1', name: 'Manager' },
            fetchGlobalData: mockFetchGlobalData,
            setDayClosed: mockSetDayClosed,
        };
        return selector(state);
    },
}));

// ── Mock payrollService ────────────────────
const mockCalculatePayroll = vi.fn();
vi.mock('@/services/payroll.service', () => ({
    payrollService: {
        calculatePayroll: (...args: unknown[]) => mockCalculatePayroll(...args),
    },
}));

// ── Mock supabase ──────────────────────────
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: () => ({
            insert: (...args: unknown[]) => {
                mockInsert(...args);
                return {
                    select: (...sArgs: unknown[]) => {
                        mockSelect(...sArgs);
                        return { single: () => mockSingle() };
                    },
                };
            },
        }),
    },
}));

// ── Mock nzst utils ────────────────────────
// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-02-14',
    nowNZST: () => '2026-02-14T10:00:00+13:00',
}));

// ── Mock logger ────────────────────────────
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Mock Toast — render message as testable text ──
vi.mock('@/components/ui/Toast', () => ({
    default: ({ message, type }: { message: string; type: string }) => (
        <div data-testid="toast" data-type={type}>{message}</div>
    ),
}));


describe('DayClosureButton', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();
        mockCalculatePayroll.mockResolvedValue(mockPayrollResult);
        // day_closures insert returns a closure record
        mockSingle.mockResolvedValue({
            data: { id: 'closure-1' },
            error: null,
        });
    });

    // ═══════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════

    it('renders the closure button with correct text', () => {
        render(<DayClosureButton />);

        const btn = screen.getByRole('button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveTextContent('End & Lock Day');
        expect(btn).toBeEnabled();
    });

    // ═══════════════════════════════════════
    // CLICK → CONFIRMATION MODAL
    // ═══════════════════════════════════════

    it('clicking the button fetches payroll and shows confirmation modal', async () => {
        render(<DayClosureButton />);

        await user.click(screen.getByRole('button'));

        await waitFor(() => {
            expect(mockCalculatePayroll).toHaveBeenCalledWith('orchard-1', '2026-02-14', '2026-02-14');
        });

        // Confirmation modal should show — check for the h2 heading specifically
        await waitFor(() => {
            expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('End & Lock Day');
        });
        expect(screen.getByText('320')).toBeInTheDocument(); // total_buckets
        expect(screen.getByText('48.5h')).toBeInTheDocument(); // total_hours
        expect(screen.getByText('$1600.00')).toBeInTheDocument(); // piece_rate
        expect(screen.getByText('$250.00')).toBeInTheDocument(); // top_up
        expect(screen.getByText('$1850.00 NZD')).toBeInTheDocument(); // total
        expect(screen.getByText('12 workers')).toBeInTheDocument();
        expect(screen.getByText('3 required top-up')).toBeInTheDocument();
        expect(screen.getByText('75% compliance rate')).toBeInTheDocument();
    });

    // ═══════════════════════════════════════
    // CANCEL CONFIRMATION
    // ═══════════════════════════════════════

    it('cancel button closes the confirmation modal', async () => {
        render(<DayClosureButton />);

        await user.click(screen.getByRole('button'));
        await waitFor(() => {
            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });

        await user.click(screen.getByText('Cancel'));

        // Modal should be gone
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    // ═══════════════════════════════════════
    // CONFIRM CLOSURE → SUCCESS
    // ═══════════════════════════════════════

    it('confirming closure inserts to Supabase and updates store', async () => {
        render(<DayClosureButton />);

        // Open confirmation
        await user.click(screen.getByRole('button'));
        await waitFor(() => {
            expect(screen.getByText('Confirm Closure', { exact: false })).toBeInTheDocument();
        });

        // Confirm
        await user.click(screen.getByText('Confirm Closure', { exact: false }));

        await waitFor(() => {
            // day_closures insert should be called with correct data
            expect(mockInsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    orchard_id: 'orchard-1',
                    date: '2026-02-14',
                    status: 'closed',
                    closed_by: 'user-1',
                    total_buckets: 320,
                    total_cost: 1850.00,
                    total_hours: 48.5,
                    wage_violations: 3,
                })
            );
        });

        await waitFor(() => {
            // Store should be updated
            expect(mockSetDayClosed).toHaveBeenCalledWith(true);
            expect(mockFetchGlobalData).toHaveBeenCalledOnce();
        });

        // Success toast should appear
        await waitFor(() => {
            const toast = screen.getByTestId('toast');
            expect(toast).toHaveTextContent('closed and locked successfully');
            expect(toast).toHaveAttribute('data-type', 'success');
        });
    });

    // ═══════════════════════════════════════
    // ERROR: PAYROLL FETCH FAILS
    // ═══════════════════════════════════════

    it('shows error toast when payroll calculation fails', async () => {
        mockCalculatePayroll.mockRejectedValueOnce(new Error('Network timeout'));

        render(<DayClosureButton />);

        await user.click(screen.getByRole('button'));

        await waitFor(() => {
            const toast = screen.getByTestId('toast');
            expect(toast).toHaveTextContent('Error fetching day summary');
            expect(toast).toHaveAttribute('data-type', 'error');
        });

        // Confirmation modal should NOT appear
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    // ═══════════════════════════════════════
    // ERROR: SUPABASE INSERT FAILS
    // ═══════════════════════════════════════

    it('shows error toast when Supabase closure insert fails', async () => {
        // day_closures insert returns an error
        mockSingle.mockResolvedValueOnce({
            data: null,
            error: { message: 'RLS policy violation' },
        });

        render(<DayClosureButton />);

        // Open and confirm
        await user.click(screen.getByRole('button'));
        await waitFor(() => {
            expect(screen.getByText('Confirm Closure', { exact: false })).toBeInTheDocument();
        });
        await user.click(screen.getByText('Confirm Closure', { exact: false }));

        await waitFor(() => {
            const toast = screen.getByTestId('toast');
            expect(toast).toHaveTextContent('Error closing day');
            expect(toast).toHaveAttribute('data-type', 'error');
        });

        // Store should NOT be updated on failure
        expect(mockSetDayClosed).not.toHaveBeenCalled();
    });
});
