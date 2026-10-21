/**
 * TeamLeader Page Tests
 *
 * Verifies: renders page shell with Header + BottomNav, default tab is home
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: vi.fn(selector => {
    const state = {
      fetchGlobalData: vi.fn(),
      orchard: { id: 'orch-1', name: 'Test Orchard' },
    };
    return selector(state);
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Test User', role: 'team_leader' },
    signOut: vi.fn(),
    isAuthenticated: true,
    availableOrchards: [],
    orchardId: 'test-orchard',
    switchOrchard: vi.fn(),
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

vi.mock('../components/views/team-leader/HomeView', () => ({
  default: () => <div data-testid="home-view">Home View</div>,
}));
vi.mock('../components/views/team-leader/TeamView', () => ({
  default: () => <div>Team View</div>,
}));
vi.mock('../components/views/team-leader/TasksView', () => ({
  default: () => <div>Tasks View</div>,
}));
vi.mock('../components/views/team-leader/ProfileView', () => ({
  default: () => <div>Profile View</div>,
}));
vi.mock('../components/views/team-leader/MessagingView', () => ({
  default: () => <div>Messaging View</div>,
}));
vi.mock('../components/views/team-leader/AttendanceView', () => ({
  default: () => <div>Attendance View</div>,
}));
vi.mock('@/components/views/manager/TimesheetEditor', () => ({
  default: () => <div>Timesheet Editor</div>,
}));
// #7: el cajón de perfil se monta en la página (igual que en Manager)
vi.mock('@/components/PickerDrawer', () => ({
  PickerDrawer: () => <div data-testid="picker-drawer" />,
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

import TeamLeader from './TeamLeader';

describe('TeamLeader Page', () => {
  it('renders the header with Team Leader title', () => {
    render(<TeamLeader />);
    expect(screen.getByText('Team Leader')).toBeTruthy();
  });

  it('renders the Home view by default', async () => {
    render(<TeamLeader />);
    expect(await screen.findByTestId('home-view')).toBeTruthy();
  });

  it('mounts the picker profile drawer (same component as Manager)', () => {
    render(<TeamLeader />);
    expect(screen.getByTestId('picker-drawer')).toBeTruthy();
  });

  it('renders bottom navigation tabs', () => {
    render(<TeamLeader />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Roll Call')).toBeTruthy();
    expect(screen.getByText('Map')).toBeTruthy();
    expect(screen.getByText('Timesheet')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });
});
