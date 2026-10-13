/**
 * Sprint 14 extracted components — Consolidated render tests
 *
 * Covers: DashboardStatCard, DashboardEmptyState, RowTeamDisplay, RowGrid,
 * AnomalyCard, SmartDismissals, OrchardStep, TeamsStep, RatesStep, SummaryStep,
 * AdminOrchardsTab, AdminUsersTab, AdminComplianceTab
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock Zustand store
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((selector) => {
        const state = {
            crew: [],
            bucketRecords: [],
            settings: { pieceRatePerBucket: 1.5, bucketsPerBin: 50, targetBinsPerDay: 100, minimumWage: 22.70 },
            orchard: { id: 'o1', name: 'Test Orchard', total_rows: 20 },
            rowAssignments: [],
            stats: { totalBuckets: 0, payEstimate: 0, tons: 0, velocity: 0, goalVelocity: 0, binsFull: 0 },
        };
        if (selector) return selector(state);
        return state;
    }),
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: { id: 'u1', role: 'manager', full_name: 'Test Manager' },
        orchardId: 'o1',
    }),
    default: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
}));

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── DashboardStatCard ──
describe('DashboardStatCard', () => {
    it('renders with title and value', async () => {
        const mod = await import('../components/views/manager/DashboardStatCard');
        const Component = mod.default;
        render(<Component title="Total Bins" value={42} icon="inventory_2" />);
        expect(screen.getByText('Total Bins')).toBeDefined();
    });

    it('renders with trend indicator', async () => {
        const mod = await import('../components/views/manager/DashboardStatCard');
        const Component = mod.default;
        render(<Component title="Velocity" value={12} icon="speed" trend={5} />);
        expect(screen.getByText(/vs yesterday/)).toBeDefined();
    });

    it('renders with unit', async () => {
        const mod = await import('../components/views/manager/DashboardStatCard');
        const Component = mod.default;
        render(<Component title="Cost" value={"$1,234"} icon="payments" unit="NZD" />);
        expect(screen.getByText('NZD')).toBeDefined();
    });
});

// ── DashboardEmptyState ──
describe('DashboardEmptyState', () => {
    it('renders empty state with CTA buttons', async () => {
        const mod = await import('../components/views/manager/DashboardEmptyState');
        const Component = mod.default;
        const mockSetTab = vi.fn();
        render(<Component setActiveTab={mockSetTab} />);
        expect(screen.getByText('No Harvest Data Yet')).toBeDefined();
        expect(screen.getByText('Add Pickers')).toBeDefined();
        expect(screen.getByText('View Map')).toBeDefined();
    });

    it('calls setActiveTab when Add Pickers is clicked', async () => {
        const mod = await import('../components/views/manager/DashboardEmptyState');
        const Component = mod.default;
        const mockSetTab = vi.fn();
        render(<Component setActiveTab={mockSetTab} />);
        screen.getByText('Add Pickers').closest('button')?.click();
        expect(mockSetTab).toHaveBeenCalledWith('teams');
    });
});
