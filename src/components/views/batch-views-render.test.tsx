/**
 * Batch Component Render Tests — HHRR, Logistics, Team Leader, Runner
 * Covers ~20 previously untested view/tab components with RTL rendering
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Global Mocks ──────────────────────────────────
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeAllChannels: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@test.com' },
    currentRole: 'manager',
    orchardId: 'o1',
    isAuthenticated: true,
  }),
}));

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: vi.fn((sel?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      crew: [],
      bucketRecords: [],
      rows: [],
      orchardBlocks: [],
      orchardMapRows: [],
      orchard: { id: 'o1', name: 'Test Orchard' },
      currentUser: { id: 'u1', role: 'manager' },
      stats: { totalBuckets: 100, activePickers: 5, rate: 12.5 },
      inventory: [],
      settings: { piece_rate: 3.5, min_wage_rate: 23.5 },
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ show: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('@/services/gateway.service', () => ({
  gatewayService: {
    withResilience: vi.fn((_n: string, fn: () => Promise<unknown>) => fn()),
    onEvent: vi.fn(() => () => {}),
  },
}));

vi.mock('@/services/audit.service', () => ({
  auditService: { logAudit: vi.fn(), logAuth: vi.fn(), logPickerEvent: vi.fn() },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
  edgeFunctionsRepository: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

vi.mock('@/services/logistics-dept.service', () => ({
  fetchFleet: vi.fn().mockResolvedValue([]),
  logisticsDeptService: {
    getTransportRequests: vi.fn().mockResolvedValue([]),
    getTractors: vi.fn().mockResolvedValue([]),
    updateTransportRequest: vi.fn().mockResolvedValue({}),
    updateTractor: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/services/compliance.service', () => ({
  NZ_MINIMUM_WAGE: 23.5,
  NZ_BREAK_REQUIREMENTS: {
    REST_BREAK_INTERVAL_MINUTES: 120,
    MEAL_BREAK_INTERVAL_MINUTES: 240,
    HYDRATION_REMINDER_INTERVAL_MINUTES: 45,
  },
  checkPickerCompliance: vi.fn(() => ({
    isCompliant: true,
    violations: [],
    wageCompliance: { isCompliant: true },
  })),
  calculateNextBreakDue: vi.fn(),
  checkWageCompliance: vi.fn(() => ({ isCompliant: true, shortfall: 0, topUpRequired: 0 })),
}));

// ── HHRR Components ──────────────────────────────

describe('CalendarTab', () => {
  it('renders schedule and leave sections', async () => {
    const mod = await import('@/components/views/hhrr/CalendarTab');
    const CalendarTab = mod.default;
    const { container } = render(<CalendarTab />);
    expect(container.textContent).toContain("Today's Schedule");
    expect(container.textContent).toContain('Upcoming Leave');
  });

  it('shows schedule items', async () => {
    const mod = await import('@/components/views/hhrr/CalendarTab');
    const CalendarTab = mod.default;
    const { container } = render(<CalendarTab />);
    expect(container.textContent).toContain('07:00');
    expect(container.textContent).toContain('Shift Start');
  });

  it('does not show sample leave entries', async () => {
    const mod = await import('@/components/views/hhrr/CalendarTab');
    const CalendarTab = mod.default;
    const { container } = render(<CalendarTab />);
    expect(container.textContent).not.toContain('Aroha W.');
    expect(container.textContent).toContain('not tracked in the app yet');
  });
});

describe('SeasonalPlanningTab', () => {
  it('renders with empty employees array', async () => {
    const mod = await import('@/components/views/hhrr/SeasonalPlanningTab');
    const SeasonalPlanningTab = mod.default;
    const { container } = render(<SeasonalPlanningTab employees={[]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders workforce planning sections with employees', async () => {
    const mod = await import('@/components/views/hhrr/SeasonalPlanningTab');
    const SeasonalPlanningTab = mod.default;
    const employees = [
      {
        id: 'e1',
        name: 'Alice',
        status: 'active',
        contract_end: '2026-04-15',
        role: 'picker',
        visa_type: 'RSE',
      },
      {
        id: 'e2',
        name: 'Bob',
        status: 'active',
        contract_end: '2026-03-20',
        role: 'picker',
        visa_type: 'WH',
      },
    ];
    const { container } = render(<SeasonalPlanningTab employees={employees as any} />);
    // Should show headcount and contract expiry forecast
    expect(container.textContent).toContain('Active Headcount');
    expect(container.textContent).toContain('Contract Expiry');
  });
});

// ── Logistics Components ──────────────────────────

describe('FleetTab', () => {
  it('renders with empty tractors', async () => {
    const mod = await import('@/components/views/logistics/FleetTab');
    const FleetTab = mod.default;
    const { container } = render(<FleetTab tractors={[]} />);
    expect(container.textContent).toContain('Orchard Zone Map');
  });

  it('renders tractor cards', async () => {
    const mod = await import('@/components/views/logistics/FleetTab');
    const FleetTab = mod.default;
    const tractors = [
      {
        id: 't1',
        name: 'Tractor Alpha',
        driver_name: 'Driver A',
        zone: 'A1',
        status: 'active',
        bins_loaded: 5,
        max_capacity: 20,
        load_status: 'partial',
        last_update: '2026-03-09T10:00:00Z',
      },
    ];
    render(<FleetTab tractors={tractors as any} />);
    expect(screen.getByText('Tractor Alpha')).toBeDefined();
  });

  it('zone map highlights active zones', async () => {
    const mod = await import('@/components/views/logistics/FleetTab');
    const FleetTab = mod.default;
    const tractors = [
      {
        id: 't1',
        name: 'T1',
        driver_name: 'D',
        zone: 'A1',
        status: 'active',
        bins_loaded: 0,
        max_capacity: 20,
        load_status: 'empty',
        last_update: '2026-03-09T10:00:00Z',
      },
    ];
    const { container } = render(<FleetTab tractors={tractors as any} />);
    const zones = container.querySelectorAll('.aspect-square');
    expect(zones.length).toBeGreaterThan(0);
  });
});

// ── Runner Components ────────────────────────────

describe('RunnersView', () => {
  // «Runners en el huerto» (revisión 2026-10-21, punto 13): ya no lista pickers
  it('renders with title', async () => {
    const mod = await import('@/components/views/runner/RunnersView');
    const RunnersView = mod.default;
    const { container } = render(<RunnersView onBack={vi.fn()} />);
    expect(container.textContent).toContain('Runners in the orchard');
  });

  it('shows empty state when no crew', async () => {
    const mod = await import('@/components/views/runner/RunnersView');
    const RunnersView = mod.default;
    const { container } = render(<RunnersView onBack={vi.fn()} />);
    expect(container.textContent).toContain('No runners in the orchard');
  });

  it('calls onBack when back button clicked', async () => {
    const mod = await import('@/components/views/runner/RunnersView');
    const RunnersView = mod.default;
    const onBack = vi.fn();
    render(<RunnersView onBack={onBack} />);
    const backBtn = screen.getByText('arrow_back');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });
});

