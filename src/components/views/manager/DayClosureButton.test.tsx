/**
 * DayClosureButton.test.tsx — cierre del día (B2, auditoría 2026-10-23)
 *
 * - El estado «día cerrado» se lee de day_closures al cargar: no se puede cerrar dos veces
 * - Cerrar: resumen (calculate-payroll) → confirmación → day_closures (upsert) →
 *   auditoría por submit-audit-log (logAudit) → aviso visible y store
 * - Errores de resumen y de guardado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayClosureButton } from './DayClosureButton';
import type { PayrollResult } from '@/services/payroll.service';

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
    compliance: { workers_total: 12, workers_below_minimum: 3, compliance_rate: 75.0 },
};

const mockFetchGlobalData = vi.fn().mockResolvedValue(undefined);
const mockSetDayClosed = vi.fn();
let storeDayClosed = false;

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
        orchard: { id: 'orchard-1', name: 'Te Puke Orchard' },
        currentUser: { id: 'user-1', name: 'Manager' },
        fetchGlobalData: mockFetchGlobalData,
        dayClosed: storeDayClosed,
        setDayClosed: mockSetDayClosed,
    }),
}));

const mockCalculatePayroll = vi.fn();
vi.mock('@/services/payroll.service', () => ({
    payrollService: { calculatePayroll: (...args: unknown[]) => mockCalculatePayroll(...args) },
}));

const mockGetForDate = vi.fn();
const mockClose = vi.fn();
vi.mock('@/repositories/day-closure.repository', () => ({
    dayClosureRepository: {
        getForDate: (...a: unknown[]) => mockGetForDate(...a),
        close: (...a: unknown[]) => mockClose(...a),
    },
}));

const mockLogAudit = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/audit.service', () => ({
    logAudit: (...a: unknown[]) => mockLogAudit(...a),
}));

vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-02-14',
    nowNZST: () => '2026-02-14T10:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ui/Toast', () => ({
    default: ({ message, type }: { message: string; type: string }) => (
        <div data-testid="toast" data-type={type}>{message}</div>
    ),
}));

describe('DayClosureButton', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();
        storeDayClosed = false;
        mockCalculatePayroll.mockResolvedValue(mockPayrollResult);
        mockGetForDate.mockResolvedValue(null);
        mockClose.mockResolvedValue({ id: 'closure-1', orchard_id: 'orchard-1', date: '2026-02-14', status: 'closed' });
    });

    it('renders the closure button and reads today\'s closure from the database', async () => {
        render(<DayClosureButton />);
        const btn = screen.getByRole('button');
        expect(btn).toHaveTextContent('End & Lock Day');
        expect(btn).toBeEnabled();
        await waitFor(() => expect(mockGetForDate).toHaveBeenCalledWith('orchard-1', '2026-02-14'));
        expect(mockSetDayClosed).toHaveBeenCalledWith(false);
    });

    it('a day already closed (from day_closures) cannot be closed again', async () => {
        mockGetForDate.mockResolvedValue({ id: 'c0', status: 'closed' });
        render(<DayClosureButton />);
        await waitFor(() => expect(mockSetDayClosed).toHaveBeenCalledWith(true));
    });

    it('when the store says closed the button is disabled and says so', async () => {
        storeDayClosed = true;
        render(<DayClosureButton />);
        const btn = screen.getByRole('button');
        expect(btn).toBeDisabled();
        expect(btn).toHaveTextContent('Day closed');
        expect(screen.getByTestId('day-closed-status')).toBeInTheDocument();
        await user.click(btn);
        expect(mockCalculatePayroll).not.toHaveBeenCalled();
    });

    it('clicking the button fetches payroll and shows the confirmation modal', async () => {
        render(<DayClosureButton />);
        await user.click(screen.getByRole('button'));
        await waitFor(() => expect(mockCalculatePayroll).toHaveBeenCalledWith('orchard-1', '2026-02-14', '2026-02-14'));
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('End & Lock Day');
        expect(screen.getByText('320')).toBeInTheDocument();
        expect(screen.getByText('48.5h')).toBeInTheDocument();
        expect(screen.getByText('$1,850.00 NZD')).toBeInTheDocument();
        expect(screen.getByText('75% compliance rate')).toBeInTheDocument();
    });

    it('cancel closes the confirmation modal', async () => {
        render(<DayClosureButton />);
        await user.click(screen.getByRole('button'));
        await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
        await user.click(screen.getByText('Cancel'));
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('confirming saves the closure, audits it through submit-audit-log and confirms', async () => {
        render(<DayClosureButton />);
        await user.click(screen.getByRole('button'));
        await waitFor(() => expect(screen.getByText('Confirm Closure', { exact: false })).toBeInTheDocument());
        await user.click(screen.getByText('Confirm Closure', { exact: false }));

        await waitFor(() => expect(mockClose).toHaveBeenCalledWith('orchard-1', '2026-02-14', 'user-1', {
            total_buckets: 320, total_cost: 1850, total_hours: 48.5, wage_violations: 3,
        }));
        expect(mockLogAudit).toHaveBeenCalledWith('day.closed', 'day_closed', expect.objectContaining({
            userId: 'user-1', orchardId: 'orchard-1', entityType: 'day_closures', entityId: 'closure-1', immediate: true,
            details: expect.objectContaining({ date: '2026-02-14', total_buckets: 320 }),
        }));
        await waitFor(() => expect(mockSetDayClosed).toHaveBeenCalledWith(true));
        expect(mockFetchGlobalData).toHaveBeenCalledOnce();
        const toast = screen.getByTestId('toast');
        expect(toast).toHaveTextContent('closed and locked successfully');
        expect(toast).toHaveAttribute('data-type', 'success');
    });

    it('shows an error toast when the payroll summary fails', async () => {
        mockCalculatePayroll.mockRejectedValue(new Error('Edge Function timeout'));
        render(<DayClosureButton />);
        await user.click(screen.getByRole('button'));
        await waitFor(() => expect(screen.getByTestId('toast')).toHaveAttribute('data-type', 'error'));
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('shows an error toast when saving the closure fails, without marking the day closed', async () => {
        mockClose.mockRejectedValue(new Error('Database error'));
        render(<DayClosureButton />);
        await user.click(screen.getByRole('button'));
        await waitFor(() => expect(screen.getByText('Confirm Closure', { exact: false })).toBeInTheDocument());
        await user.click(screen.getByText('Confirm Closure', { exact: false }));
        await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Error closing day'));
        expect(mockSetDayClosed).not.toHaveBeenCalledWith(true);
        expect(mockLogAudit).not.toHaveBeenCalled();
    });
});
