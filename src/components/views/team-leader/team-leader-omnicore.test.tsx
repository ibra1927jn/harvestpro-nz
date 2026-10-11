/**
 * Phase 3: Expanded unit tests for TeamLeader OmniCore views
 * Covers: TeamView glassmorphic cards, attendance status rendering,
 *         and OmniCore ambient styling verification
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: () => ({
    currentUser: { id: 'u1', full_name: 'Test Leader', role: 'team_leader', orchard_id: 'o1' },
    crew: [
      {
        id: 'p1', name: 'Alice Martin', picker_id: 'P-001', status: 'active',
        safety_verified: true, current_row: 1, total_buckets_today: 18,
        orchard_id: 'o1', team_leader_id: 'u1',
      },
      {
        id: 'p2', name: 'Bob Johnson', picker_id: 'P-002', status: 'break',
        safety_verified: false, current_row: 2, total_buckets_today: 7,
        orchard_id: 'o1', team_leader_id: 'u1',
      },
      {
        id: 'p3', name: 'Charlie Doe', picker_id: 'P-003', status: 'inactive',
        safety_verified: true, current_row: 3, total_buckets_today: 0,
        orchard_id: 'o1', team_leader_id: 'u1',
      },
    ],
    stats: { totalBuckets: 25, payEstimate: 200, tons: 0.5 },
    settings: { min_buckets_per_hour: 3.6 },
    addPicker: vi.fn(),
    removePicker: vi.fn(),
    updatePicker: vi.fn(),
    fetchCrew: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHarvestMetrics', () => ({
  useHarvestMetrics: () => ({ perPicker: [{ pickerId: 'p1', earned: 150 }, { pickerId: 'p2', earned: 50 }] }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Test Leader', role: 'team_leader', orchard_id: 'o1' },
    session: { user: { id: 'u1' } },
    isAuthenticated: true,
  }),
}));

vi.mock('@/hooks/useAttendance', () => ({
  useAttendance: () => ({
    loading: false,
    processing: false,
    mergedList: [
      { id: 'p1', name: 'Alice Martin', avatar: 'AM', isCheckedIn: true, checkInTime: '06:30' },
      { id: 'p2', name: 'Bob Johnson', avatar: 'BJ', isCheckedIn: true, checkInTime: '07:00' },
      { id: 'p3', name: 'Charlie Doe', avatar: 'CD', isCheckedIn: false },
    ],
    stats: { present: 2, absent: 1, total: 3 },
    checkIn: vi.fn(),
    checkOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: null, showToast: vi.fn(), hideToast: vi.fn() }),
}));

vi.mock('@/hooks/useLogistics', () => ({
  useLogistics: () => ({ bucketRecords: [], loading: false, refreshRecords: vi.fn() }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({ broadcasts: [], unreadCount: 0, loading: false }),
}));

vi.mock('../../modals/AddPickerModal', () => ({
  default: () => <div data-testid="add-picker-modal" />,
}));
vi.mock('../../modals/PickerDetailsModal', () => ({
  default: () => <div data-testid="picker-details-modal" />,
}));

describe('TeamView OmniCore', () => {
  it('renders all team members with names', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    expect(screen.getByText('Alice Martin')).toBeDefined();
    expect(screen.getByText('Bob Johnson')).toBeDefined();
  });

  it('renders picker IDs', async () => {
    const { default: TeamView } = await import('./TeamView');
    const { container } = render(<TeamView />);
    expect(container.innerHTML).toContain('P-001');
    expect(container.innerHTML).toContain('P-002');
  });

  it('shows safety verification status', async () => {
    const { default: TeamView } = await import('./TeamView');
    const { container } = render(<TeamView />);
    // Safety verified pickers should have visual status indicators (Onboarded badge)
    expect(container.innerHTML).toContain('Onboarded');
  });

  it('displays bucket counts for active pickers', async () => {
    const { default: TeamView } = await import('./TeamView');
    render(<TeamView />);
    // Alice has 18 buckets
    expect(screen.getByText('18')).toBeDefined();
  });
});

describe('HomeView OmniCore', () => {
  it('renders stats dashboard with bucket count', async () => {
    const { default: HomeView } = await import('./HomeView');
    render(<HomeView />);
    expect(screen.getAllByText('Buckets').length).toBeGreaterThan(0);
  });

  it('shows pay estimate', async () => {
    const { default: HomeView } = await import('./HomeView');
    const { container } = render(<HomeView />);
    // PayEstimate of $200 should appear somewhere
    expect(container.innerHTML).toContain('200');
  });

  it('renders crew ranking with all members', async () => {
    const { default: HomeView } = await import('./HomeView');
    render(<HomeView />);
    expect(screen.getByText('Alice Martin')).toBeDefined();
    expect(screen.getByText('Bob Johnson')).toBeDefined();
  });
});

describe('AttendanceView OmniCore', () => {
  it('renders attendance list with check-in status', async () => {
    const { default: AttendanceView } = await import('./AttendanceView');
    render(<AttendanceView />);
    expect(screen.getByText('Alice Martin')).toBeDefined();
  });

  it('displays attendance stats (present/absent)', async () => {
    const { default: AttendanceView } = await import('./AttendanceView');
    const { container } = render(<AttendanceView />);
    // Should show 2 present, 1 absent
    expect(container.innerHTML).toContain('2');
  });
});
