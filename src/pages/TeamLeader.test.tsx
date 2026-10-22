/**
 * TeamLeader Page Tests
 *
 * Verifies: renders page shell with Header + BottomNav, default tab is home
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { editorProps } = vi.hoisted(() => ({ editorProps: { last: null as Record<string, unknown> | null } }));

// ── Mocks ────────────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: vi.fn(selector => {
    const state = {
      fetchGlobalData: vi.fn(),
      orchard: { id: 'orch-1', name: 'Test Orchard' },
      crew: [
        { id: 'p1', name: 'Mine A', role: 'picker', status: 'active', team_leader_id: 'u1' },
        { id: 'p2', name: 'Mine B', role: 'picker', status: 'active', team_leader_id: 'u1' },
        { id: 'p3', name: 'Other', role: 'picker', status: 'active', team_leader_id: 'u2' },
        { id: 'p4', name: 'Gone', role: 'picker', status: 'archived', team_leader_id: 'u1' },
      ],
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
vi.mock('../components/views/team-leader/MessagingView', () => ({
  default: () => <div>Messaging View</div>,
}));
vi.mock('../components/views/team-leader/AttendanceView', () => ({
  default: () => <div>Attendance View</div>,
}));
vi.mock('@/components/views/manager/TimesheetEditor', () => ({
  default: (props: Record<string, unknown>) => {
    editorProps.last = props;
    return <div>Timesheet Editor</div>;
  },
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
// «Mi cuenta» sustituye a la maqueta ProfileView del team leader (revisión 2026-10-21, #10)
vi.mock('@/hooks/useAvatarUrl', () => ({ useAvatarSignedUrl: () => null, useUserAvatarUrl: () => null }));
vi.mock('@/components/common/account/AccountSheet', () => ({
  default: () => <div role="dialog" aria-label="My account">Account</div>,
}));

import TeamLeader from './TeamLeader';
import { fireEvent } from '@testing-library/react';

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

  // #9: el team leader solo ve y corrige los fichajes de SU equipo
  it("scopes the timesheet editor to the team leader's own team", async () => {
    render(<TeamLeader />);
    fireEvent.click(screen.getByText('Timesheet'));
    expect(await screen.findByText('Timesheet Editor')).toBeTruthy();
    expect(editorProps.last?.orchardId).toBe('orch-1');
    expect(editorProps.last?.pickerIds).toEqual(['p1', 'p2']);
  });

  it('renders bottom navigation tabs', () => {
    render(<TeamLeader />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Roll Call')).toBeTruthy();
    expect(screen.getByText('Map')).toBeTruthy();
    expect(screen.getByText('Timesheet')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('has no profile tab any more: the avatar opens My account', async () => {
    render(<TeamLeader />);
    expect(screen.queryByText('Profile View')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open profile settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open my account' }));
    expect(await screen.findByRole('dialog', { name: 'My account' })).toBeTruthy();
  });
});
