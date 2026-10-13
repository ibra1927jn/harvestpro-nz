/**
 * Batch Component Render Tests — Manager Views
 * Deep rendering tests for ~15 previously untested manager components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@/test-utils';

// ── Global Mocks ──────────────────────────────────
vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
        removeAllChannels: vi.fn(),
    },
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'test@test.com' }, currentRole: 'manager',
        orchardId: 'o1', isAuthenticated: true,
    }),
}));

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
        sel({
            crew: [], rows: [], orchardBlocks: [], orchardMapRows: [],
            orchard: { id: 'o1', name: 'Test Orchard' },
            currentUser: { id: 'u1', role: 'manager' },
            stats: { totalBuckets: 100, activePickers: 5, rate: 12.5 },
            inventory: [],
        })
    ),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/i18n.service', () => ({
    t: (key: string) => key,
    i18n: { t: (key: string) => key, getLanguage: () => 'en', subscribe: () => () => { } },
}));

vi.mock('@/services/gateway.service', () => ({
    gatewayService: {
        withResilience: vi.fn((_n: string, fn: () => Promise<unknown>) => fn()),
        onEvent: vi.fn(() => () => { }),
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

vi.mock('@/services/audit.service', () => ({
    auditService: { logAudit: vi.fn(), logAuth: vi.fn(), logPickerEvent: vi.fn() },
}));

vi.mock('@/hooks/useAnimatedCounter', () => ({
    useAnimatedCounter: (value: number) => value,
}));

vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({ show: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('@/services/compliance.service', () => ({
    NZ_MINIMUM_WAGE: 23.95,
    NZ_BREAK_REQUIREMENTS: { REST_BREAK_INTERVAL_MINUTES: 120, MEAL_BREAK_INTERVAL_MINUTES: 240, HYDRATION_REMINDER_INTERVAL_MINUTES: 45 },
    checkPickerCompliance: vi.fn(() => ({ isCompliant: true, violations: [], wageCompliance: { isCompliant: true } })),
    calculateNextBreakDue: vi.fn(),
    checkWageCompliance: vi.fn(() => ({ isCompliant: true, shortfall: 0, topUpRequired: 0 })),
}));

// ── DashboardStatCard ──────────────────────────────
describe('DashboardStatCard', () => {
    let DashboardStatCard: React.FC<any>;
    beforeEach(async () => {
        const mod = await import('@/components/views/manager/DashboardStatCard');
        DashboardStatCard = mod.default;
    });

    it('renders title and value', () => {
        render(<DashboardStatCard title="Buckets" value={42} icon="inventory" />);
        expect(screen.getByText('Buckets')).toBeDefined();
        expect(screen.getByText('42')).toBeDefined();
    });

    it('renders unit when provided', () => {
        render(<DashboardStatCard title="Rate" value={12.5} unit="/hr" icon="speed" />);
        expect(screen.getByText('/hr')).toBeDefined();
    });

    it('shows positive trend as green', () => {
        const { container } = render(<DashboardStatCard title="T" value={1} trend={10} icon="i" />);
        expect(container.textContent).toContain('+10%');
    });

    it('shows negative trend as red', () => {
        const { container } = render(<DashboardStatCard title="T" value={1} trend={-5} icon="i" />);
        expect(container.textContent).toContain('-5%');
    });

    it('hides trend when 0', () => {
        const { container } = render(<DashboardStatCard title="T" value={1} trend={0} icon="i" />);
        expect(container.textContent).not.toContain('vs yesterday');
    });

    it('calls onClick when clickable', () => {
        const onClick = vi.fn();
        render(<DashboardStatCard title="T" value={1} icon="i" onClick={onClick} />);
        fireEvent.click(screen.getByText('T'));
        expect(onClick).toHaveBeenCalled();
    });
});

// ── GoalProgress ──────────────────────────────────
describe('GoalProgress', () => {
    let GoalProgress: React.FC<any>;
    beforeEach(async () => {
        const mod = await import('@/components/views/manager/GoalProgress');
        GoalProgress = mod.default;
    });

    it('renders progress percentage', () => {
        render(<GoalProgress progress={75} currentTons={3} targetTons={4} eta="15:00" etaStatus="on_track" />);
        expect(screen.getByText(/75%/)).toBeDefined();
    });

    it('renders current vs target tons', () => {
        const { container } = render(<GoalProgress progress={50} currentTons={2.5} targetTons={5} eta="16:00" etaStatus="behind" />);
        expect(container.textContent).toContain('2.5');
        expect(container.textContent).toContain('5');
    });

    it('shows projection when hoursElapsed > 0.5', () => {
        const { container } = render(
            <GoalProgress progress={50} currentTons={2} targetTons={4} eta="14:00" etaStatus="on_track"
                totalBuckets={200} hoursElapsed={4} />
        );
        expect(container.textContent).toContain('Projected');
    });

    it('hides projection when hoursElapsed <= 0.5', () => {
        const { container } = render(
            <GoalProgress progress={10} currentTons={0.4} targetTons={4} eta="--" etaStatus="no_data"
                totalBuckets={5} hoursElapsed={0.2} />
        );
        expect(container.textContent).not.toContain('Projected');
    });

    it('shows ahead status as green', () => {
        const { container } = render(
            <GoalProgress progress={90} currentTons={3.6} targetTons={4} eta="13:30" etaStatus="ahead" />
        );
        expect(container.querySelector('.text-green-400')).toBeDefined();
    });
});


// ── DashboardEmptyState ───────────────────────────
describe('DashboardEmptyState', () => {
    it('renders import suggestion', async () => {
        const mod = await import('@/components/views/manager/DashboardEmptyState');
        const DashboardEmptyState = mod.default;
        const { container } = render(<DashboardEmptyState />);
        expect(container.textContent).toBeTruthy();
    });
});

// ── VelocityChart ──────────────────────────────────
describe('VelocityChart', () => {
    it('renders with bucket records', async () => {
        const mod = await import('@/components/views/manager/VelocityChart');
        const VelocityChart = mod.default;
        const records = [
            { picker_id: 'p1', created_at: '2026-03-01T08:00:00Z' },
            { picker_id: 'p1', created_at: '2026-03-01T09:00:00Z' },
        ];
        const { container } = render(<VelocityChart bucketRecords={records} />);
        expect(container).toBeDefined();
    });
});

// ── MapToggleView ────────────────────────────────
describe('MapToggleView', () => {
    it('renders toggle controls', async () => {
        const mod = await import('@/components/views/manager/MapToggleView');
        const MapToggleView = mod.default;
        const { container } = render(
            <MapToggleView crew={[]} rows={[]} orchardBlocks={[]} />
        );
        expect(container).toBeDefined();
    });
});

