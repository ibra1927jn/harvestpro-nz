/**
 * Smoke tests for team-leader views — renders each view to cover JSX branches
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: () => ({
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
    addPicker: vi.fn(),
    removePicker: vi.fn(),
    updatePicker: vi.fn(),
    fetchCrew: vi.fn(),
  }),
}));

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
      { id: 'p1', name: 'Alice', avatar: 'AL', isCheckedIn: true, checkInTime: '08:00' },
    ],
    stats: { present: 1, absent: 0, total: 1 },
    checkIn: vi.fn(),
    checkOut: vi.fn(),
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
vi.mock('../../modals/PickerDetailsModal', () => ({
  default: () => <div data-testid="picker-details-modal" />,
}));

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
});

describe('TeamView', () => {
  it('renders crew members', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    expect(screen.getByText('Alice')).toBeDefined();
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

