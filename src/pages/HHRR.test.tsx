/**
 * HHRR Page Tests
 *
 * Verifies: renders DesktopLayout with HR nav, loading state, summary cards after load
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: { id: 'u1', full_name: 'HR Admin', role: 'hr_admin' },
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

vi.mock('@/services/hhrr.service', () => ({
    loadHRDashboard: vi.fn().mockResolvedValue({
        summary: {
            activeWorkers: 42,
            pendingContracts: 3,
            payrollThisWeek: 15000,
            complianceAlerts: 1,
        },
        employees: [{ id: 'e1', name: 'Worker A', role: 'picker', status: 'active' }],
        payroll: [],
        alerts: [],
    }),
}));

vi.mock('@/components/views/hhrr/EmployeesTab', () => ({
    default: () => <div data-testid="employees-tab">Employees Tab</div>,
}));
vi.mock('@/components/views/hhrr/ContractsTab', () => ({
    default: () => <div>Contracts Tab</div>,
}));
vi.mock('@/components/views/hhrr/PayrollTab', () => ({
    default: () => <div>Payroll Tab</div>,
}));
vi.mock('@/components/views/hhrr/DocumentsTab', () => ({
    default: () => <div>Documents Tab</div>,
}));
vi.mock('@/components/views/hhrr/CalendarTab', () => ({
    default: () => <div>Calendar Tab</div>,
}));
vi.mock('@/components/views/hhrr/SeasonalPlanningTab', () => ({
    default: () => <div>Planning Tab</div>,
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

import HHRR from './HHRR';

describe('HHRR Page', () => {
    it('shows loading skeleton initially', () => {
        render(<HHRR />);
        expect(screen.getAllByTestId('loading-skeleton').length).toBeGreaterThan(0);
    });

    it('renders the Human Resources title after load', async () => {
        render(<HHRR />);
        const title = await screen.findAllByText('Human Resources');
        expect(title.length).toBeGreaterThan(0);
    });

    it('shows summary cards with data after load', async () => {
        render(<HHRR />);
        // Wait for data to load
        const activeWorkers = await screen.findByText('42');
        expect(activeWorkers).toBeTruthy();
        expect(screen.getByText('Active Workers')).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy(); // Pending contracts
    });

    it('renders navigation items', async () => {
        render(<HHRR />);
        const employees = await screen.findAllByText('Employees');
        expect(employees.length).toBeGreaterThan(0);
        expect(screen.getAllByText('Contracts').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Payroll').length).toBeGreaterThan(0);
    });

    it('shows employees tab as default', async () => {
        render(<HHRR />);
        const employeesTab = await screen.findByTestId('employees-tab');
        expect(employeesTab).toBeTruthy();
    });
});
