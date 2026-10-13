/**
 * DashboardView.test.tsx — Executive Dashboard KPIs, velocity, trends, empty state
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';
import DashboardView from './DashboardView';
import { BucketRecord, Picker, Role } from '../../../types';

// ── Mock external stores & hooks ──
vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      settings: {
        piece_rate: 6.5,
        min_wage_rate: 23.5,
        target_tons: 40,
        min_buckets_per_hour: 3.6,
      },
      orchard: { name: 'Test Orchard' },
      payroll: { finalTotal: 1500 },
      alerts: [],
      crew: [],
      bucketRecords: [],
    };
    if (selector) return selector(state);
    return state;
  },
}));

// Mockear useHarvestMetrics para evitar dependencia de datos en tiempo real
vi.mock('@/hooks/useHarvestMetrics', () => ({
  useHarvestMetrics: () => ({
    kpis: { totalBins: 150, totalLabour: 1500, totalPieceRate: 975, minWageTopUp: 525, costPerBin: 10 },
    perPicker: [],
    perTeam: [],
    efficiency: [],
    projectedEndOfDay: 300,
    hoursElapsed: 3,
    now: new Date(),
  }),
}));

vi.mock('@/hooks/useAnimatedCounter', () => ({
  useAnimatedCounter: (value: number) => value, // Return value immediately
}));

vi.mock('@/services/analytics.service', () => ({
  analyticsService: {
    calculateETA: () => ({ eta: '3:30 PM', status: 'on_track' }),
    generateDailyReport: () => 'csv-content',
    downloadCSV: vi.fn(),
  },
}));

vi.mock('@/utils/nzst', () => ({
  todayNZST: () => '2026-03-05',
  yesterdayNZST: () => '2026-03-04',
  nowNZST: () => '2026-03-05T10:00:00+13:00',
  dateInNZST: (iso: string) => (iso ? iso.substring(0, 10) : ''),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Mock heavy child components ──
vi.mock('./VelocityChart', () => ({
  default: () => <div data-testid="velocity-chart">VelocityChart</div>,
}));

vi.mock('./PerformanceFocus', () => ({
  default: () => <div data-testid="performance-focus">PerformanceFocus</div>,
}));

vi.mock('./WageShieldPanel', () => ({
  default: () => <div data-testid="wage-shield">WageShieldPanel</div>,
}));

vi.mock('./TeamLeadersSidebar', () => ({
  default: () => <div data-testid="team-leaders-sidebar">TeamLeadersSidebar</div>,
}));

vi.mock('./GoalProgress', () => ({
  default: ({ currentTons, targetTons }: { currentTons: number; targetTons: number }) => (
    <div data-testid="goal-progress">
      {currentTons} / {targetTons} t
    </div>
  ),
}));

vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../SimulationBanner', () => ({
  SimulationBanner: () => <div data-testid="simulation-banner" />,
}));

vi.mock('../../common/TrustBadges', () => ({
  TrustBadges: () => <div data-testid="trust-badges" />,
}));

// Fix worker crash: OrchardSwitcher and useAuth call location.reload() which
// kills the vitest worker process, preventing coverage from being flushed.
vi.mock('@/components/common/OrchardSwitcher', () => ({
  default: () => null,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ appUser: null, signOut: vi.fn(), isAuthenticated: false }),
}));

// ── Helpers ──
const defaultStats = {
  totalBuckets: 150,
  tons: 6.5,
  totalPickers: 12,
  payEstimate: 900,
  velocity: 50,
  goalVelocity: 60,
};

const makePicker = (id: string, name: string, role: string = 'picker'): Picker => ({
  id,
  name,
  picker_id: id,
  role: role as Role,
  orchard_id: 'o-1',
  status: 'active',
  safety_verified: true,
  avatar: '',
  current_row: 1,
  total_buckets_today: 10,
  hours: 4,
  qcStatus: [100],
});

const makeBucket = (minutesAgo: number = 0): BucketRecord => ({
  id: crypto.randomUUID(),
  picker_id: 'p-1',
  picker_name: 'Test Picker',
  orchard_id: 'o-1',
  row_number: 1,
  created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  scanned_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  quality_grade: 'A',
  bin_id: 'B-001',
});

const defaultProps = {
  stats: defaultStats,
  teamLeaders: [makePicker('tl-1', 'Team Lead A', 'team_leader')],
  crew: [makePicker('p-1', 'Picker 1'), makePicker('p-2', 'Picker 2')],
  presentCount: 12,
  setActiveTab: vi.fn(),
  bucketRecords: [makeBucket(10), makeBucket(30), makeBucket(60)],
  onUserSelect: vi.fn(),
};

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ──
  describe('Empty State', () => {
    it('shows "No Harvest Data Yet" when crew and records are empty', () => {
      render(<DashboardView {...defaultProps} crew={[]} bucketRecords={[]} />);
      expect(screen.getByText('No Harvest Data Yet')).toBeTruthy();
    });

    it('shows "Add Pickers" button in empty state', () => {
      render(<DashboardView {...defaultProps} crew={[]} bucketRecords={[]} />);
      expect(screen.getByText('Add Pickers')).toBeTruthy();
    });

    it('navigates to teams tab when "Add Pickers" clicked', () => {
      const setActiveTab = vi.fn();
      render(
        <DashboardView {...defaultProps} crew={[]} bucketRecords={[]} setActiveTab={setActiveTab} />
      );
      fireEvent.click(screen.getByText('Add Pickers'));
      expect(setActiveTab).toHaveBeenCalledWith('teams');
    });

    it('navigates to map tab when "View Map" clicked', () => {
      const setActiveTab = vi.fn();
      render(
        <DashboardView {...defaultProps} crew={[]} bucketRecords={[]} setActiveTab={setActiveTab} />
      );
      fireEvent.click(screen.getByText('View Map'));
      expect(setActiveTab).toHaveBeenCalledWith('map');
    });
  });

  // ── Dashboard with data ──
  describe('With data', () => {
    it('renders "Orchard Overview" heading', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText('Orchard Overview')).toBeTruthy();
    });

    it('renders orchard name from store', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText(/Test Orchard/)).toBeTruthy();
    });

    it('renders KPI stat cards', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText('Velocity')).toBeTruthy();
      expect(screen.getByText('Production')).toBeTruthy();
      expect(screen.getByText('Est. Cost')).toBeTruthy();
      expect(screen.getByText('Active Crew')).toBeTruthy();
    });

    it('renders stat card units', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText('b/hr')).toBeTruthy();
      expect(screen.getByText('buckets')).toBeTruthy();
      expect(screen.getByText('NZD')).toBeTruthy();
      expect(screen.getByText('pickers')).toBeTruthy();
    });

    it('renders GoalProgress component', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByTestId('goal-progress')).toBeTruthy();
    });

    it('renders VelocityChart component', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByTestId('velocity-chart')).toBeTruthy();
    });

    it('renders PerformanceFocus component', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByTestId('performance-focus')).toBeTruthy();
    });

    it('renders WageShieldPanel component', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByTestId('wage-shield')).toBeTruthy();
    });

    it('renders TeamLeadersSidebar component', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByTestId('team-leaders-sidebar')).toBeTruthy();
    });

    it('renders Export button', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText('Export')).toBeTruthy();
    });

    it('renders Live Map button', () => {
      render(<DashboardView {...defaultProps} />);
      expect(screen.getByText('Live Map')).toBeTruthy();
    });

    it('navigates to map tab on Live Map click', () => {
      const setActiveTab = vi.fn();
      render(<DashboardView {...defaultProps} setActiveTab={setActiveTab} />);
      fireEvent.click(screen.getByText('Live Map'));
      expect(setActiveTab).toHaveBeenCalledWith('map');
    });

    it('stat card Production click navigates to logistics', () => {
      const setActiveTab = vi.fn();
      render(<DashboardView {...defaultProps} setActiveTab={setActiveTab} />);
      // Click the Production stat card
      fireEvent.click(screen.getByText('Production').closest('div[class*="card-hover"]')!);
      expect(setActiveTab).toHaveBeenCalledWith('logistics');
    });

    it('shows production count from stats', () => {
      render(<DashboardView {...defaultProps} />);
      // animBuckets = stats.totalBuckets = 150
      expect(screen.getByText('150')).toBeTruthy();
    });

    it('shows active crew count from selectActiveCrew(crew)', () => {
      // defaultProps.crew = [picker('p-1'), picker('p-2')] → 2 active members
      render(<DashboardView {...defaultProps} presentCount={12} />);
      // "2" may appear multiple times (crew count + other stats); verify at least one exists
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    });
  });
});
