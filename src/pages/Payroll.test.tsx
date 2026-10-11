/**
 * Payroll Page Tests
 *
 * Verifies: renders DesktopLayout with payroll nav, loading state, summary cards, compliance banner
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: { id: 'u1', full_name: 'Payroll Admin', role: 'payroll_admin' },
        signOut: vi.fn(),
        isAuthenticated: true,
    }),
}));

vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => ({ unreadCount: 0 }),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('@/services/offline.service', () => ({
    offlineService: { getPendingCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('@/hooks/usePayroll', () => ({
    usePayroll: () => ({
        isLoading: false,
        hasLoadedOnce: true,
        error: null,
        week: { start: '2026-10-05', end: '2026-10-11', closesOn: '2026-10-12' },
        goToWeek: vi.fn(),
        orchardId: 'orch-1',
        summary: {
            total_buckets: 1500,
            total_hours: 320.5,
            total_piece_rate_earnings: 5250,
            total_top_up: 420,
            total_earnings: 5670,
        },
        compliance: {
            workers_below_minimum: 2,
            workers_total: 15,
            compliance_rate: 86.7,
        },
        pickers: [],
        settings: { bucket_rate: 3.5, min_wage_rate: 23.95 },
    }),
}));

vi.mock('@/components/views/payroll/PayrollTabs', () => ({
    SummaryCard: ({ label, value }: { label: string; value: string }) => (
        <div data-testid={`summary-${label}`}>{label}: {value}</div>
    ),
    PayrollDashboard: () => <div data-testid="payroll-dashboard">Dashboard</div>,
    TimesheetsTab: () => <div>Timesheets</div>,
    WageCalculatorTab: () => <div>Calculator</div>,
    ExportTab: () => <div>Export</div>,
}));

vi.mock('@/components/views/payroll/ExportHistoryTab', () => ({
    default: () => <div>Export History</div>,
}));

vi.mock('@/components/ui/LoadingSkeleton', () => ({
    default: () => <div data-testid="loading-skeleton">Loading...</div>,
}));

vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/common/NotificationPanel', () => ({
    default: () => <div>Notifications</div>,
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
    default: () => <div>Theme</div>,
}));

import Payroll from './Payroll';

describe('Payroll Page', () => {
    it('renders without crashing', () => {
        const { container } = render(<Payroll />);
        expect(container).toBeTruthy();
    });

    it('renders the Payroll Admin title', () => {
        render(<Payroll />);
        expect(screen.getAllByText('Payroll Admin').length).toBeGreaterThan(0);
    });

    it('renders summary cards with data', () => {
        render(<Payroll />);
        expect(screen.getByText(/Total Buckets/)).toBeTruthy();
        expect(screen.getByText(/Total Hours/)).toBeTruthy();
        expect(screen.getByText(/Piece Rate/)).toBeTruthy();
        expect(screen.getByText(/Total Payroll/)).toBeTruthy();
    });

    it('shows Wage Shield compliance banner when workers below minimum', () => {
        render(<Payroll />);
        expect(screen.getByText(/Wage Shield Active/)).toBeTruthy();
        expect(screen.getByText(/2 of 15 workers/)).toBeTruthy();
    });

    it('renders navigation items', () => {
        render(<Payroll />);
        expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Timesheets').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wage Calculator').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Export').length).toBeGreaterThan(0);
    });

    it('shows payroll dashboard as default', () => {
        render(<Payroll />);
        expect(screen.getByTestId('payroll-dashboard')).toBeTruthy();
    });
});
