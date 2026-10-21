/**
 * Smoke tests for team-leader views — renders each view to cover JSX branches
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const { mockOpenPickerProfile, mockCheckIn, mockCheckOut } = vi.hoisted(() => ({
  mockOpenPickerProfile: vi.fn(),
  mockCheckIn: vi.fn().mockResolvedValue(undefined),
  mockCheckOut: vi.fn().mockResolvedValue(undefined),
}));

// El mock respeta el selector (useHarvestStore(s => s.x)) y la forma sin selector
vi.mock('@/stores/useHarvestStore', () => {
  const state = {
    openPickerProfile: mockOpenPickerProfile,
    currentUser: { id: 'u1', full_name: 'Test User', role: 'team_leader', orchard_id: 'o1' },
    crew: [
      {
        id: 'p1',
        name: 'Alice',
        picker_id: 'P-001',
        status: 'active',
        safety_verified: true,
        current_row: 1,
        total_buckets_today: 10,
        orchard_id: 'o1',
        team_leader_id: 'u1',
      },
      {
        id: 'p2',
        name: 'Bob',
        picker_id: 'P-002',
        status: 'break',
        safety_verified: false,
        current_row: 2,
        total_buckets_today: 5,
        orchard_id: 'o1',
        team_leader_id: 'u1',
      },
    ],
    stats: { totalBuckets: 15, payEstimate: 120, tons: 0.3 },
    settings: { min_buckets_per_hour: 3.6 },
    orchard: { id: 'o1', name: 'Test Orchard', total_rows: 10 },
    orchardBlocks: [],
    rowTargets: {},
    selectedBlockId: null,
    selectedVariety: 'ALL',
    setSelectedBlock: vi.fn(),
    setSelectedVariety: vi.fn(),
    rowAssignments: [],
    bucketRecords: [],
    assignRow: vi.fn(),
    addPicker: vi.fn(),
    removePicker: vi.fn(),
    updatePicker: vi.fn(),
    fetchCrew: vi.fn(),
  };
  return {
    useHarvestStore: (selector?: (st: typeof state) => unknown) => (selector ? selector(state) : state),
  };
});

vi.mock('@/hooks/useHarvestMetrics', () => ({
  useHarvestMetrics: () => ({ perPicker: [{ pickerId: 'p1', earned: 80 }, { pickerId: 'p2', earned: 40 }] }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Test User', role: 'team_leader', orchard_id: 'o1' },
    session: { user: { id: 'u1' } },
    isAuthenticated: true,
  }),
}));

vi.mock('@/hooks/useAttendance', () => ({
  useAttendance: () => ({
    loading: false,
    processing: false,
    mergedList: [
      { id: 'p1', name: 'Alice', avatar: 'AL', isPresent: true, attendanceRecord: { id: 'att-1', check_in: '2026-10-13T07:00:00+13:00' } },
      { id: 'p2', name: 'Bob', avatar: 'BO', isPresent: false },
    ],
    stats: { present: 1, absent: 1, total: 2 },
    checkIn: mockCheckIn,
    checkOut: mockCheckOut,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toast: null,
    showToast: vi.fn(),
    hideToast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLogistics', () => ({
  useLogistics: () => ({
    bucketRecords: [],
    loading: false,
    refreshRecords: vi.fn(),
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({
    broadcasts: [],
    unreadCount: 0,
    loading: false,
  }),
}));

vi.mock('../../modals/AddPickerModal', () => ({
  default: () => <div data-testid="add-picker-modal" />,
}));

beforeEach(() => {
  mockOpenPickerProfile.mockClear();
  mockCheckIn.mockClear();
  mockCheckOut.mockClear();
});

describe('HomeView', () => {
  it('renders stats cards', async () => {
    const { default: HomeView } = await import('./HomeView');
    render(<HomeView />);
    expect(screen.getAllByText('Buckets').length).toBeGreaterThan(0);
  });

  it('renders crew ranking', async () => {
    const { default: HomeView } = await import('./HomeView');
    render(<HomeView />);
    expect(screen.getByText('Alice')).toBeDefined();
  });
});

describe('AttendanceView', () => {
  it('renders attendance list', async () => {
    const { default: AttendanceView } = await import('./AttendanceView');
    render(<AttendanceView />);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  // #7: el nombre abre el cajón de perfil; el botón de fichaje sigue aparte y no se dispara
  it('tapping the name opens the profile drawer without checking anyone in or out', async () => {
    const { default: AttendanceView } = await import('./AttendanceView');
    render(<AttendanceView />);
    fireEvent.click(screen.getByRole('button', { name: "Open Alice's profile" }));
    expect(mockOpenPickerProfile).toHaveBeenCalledWith('p1');
    expect(mockCheckOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: "Open Bob's profile" }));
    expect(mockOpenPickerProfile).toHaveBeenLastCalledWith('p2');
    expect(mockCheckIn).not.toHaveBeenCalled();
    // El fichaje sigue teniendo su propio botón
    expect(screen.getByRole('button', { name: 'Check out Alice' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Check in Bob' })).toBeDefined();
  });
});

describe('TeamView', () => {
  it('renders crew members', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  // #7: un solo componente de perfil para TL y manager (el cajón), sin PickerDetailsModal
  it('tapping a crew card opens the picker drawer (no legacy details modal)', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    fireEvent.click(screen.getByRole('button', { name: "Open Alice's profile" }));
    expect(mockOpenPickerProfile).toHaveBeenCalledWith('p1');
    expect(screen.queryByTestId('picker-details-modal')).toBeNull();
    // Toda la tarjeta también abre el perfil (zona de toque grande)
    fireEvent.click(screen.getByDisplayValue('P-002').closest('div.cursor-pointer') as HTMLElement);
    expect(mockOpenPickerProfile).toHaveBeenLastCalledWith('p2');
  });

  it('typing in the harness field does not open the profile', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    const harness = screen.getAllByPlaceholderText('Assign...')[0];
    fireEvent.click(harness);
    expect(mockOpenPickerProfile).not.toHaveBeenCalled();
  });

  // Soltar o dar de baja es de RRHH (regla 2026-10-16): sin botón de borrar
  it('has no remove button and points to HR instead', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    expect(screen.queryByRole('button', { name: /delete|archive|remove/i })).toBeNull();
    expect(screen.getByText(/ask HR/i)).toBeDefined();
  });
});

describe('TasksView', () => {
  it('renders without crashing', async () => {
    const { default: TasksView } = await import('./TasksView');
    const { container } = render(<TasksView />);
    expect(container.firstChild).toBeDefined();
  });
});

describe('ProfileView', () => {
  it('renders user profile', async () => {
    const { default: ProfileView } = await import('./ProfileView');
    const { container } = render(<ProfileView />);
    expect(container.firstChild).toBeDefined();
  });
});

// LogisticsView receives bucketRecords as direct prop — skip smoke test

