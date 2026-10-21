/**
 * Tests for Header — Shared mobile header with notifications and sign-out
 *
 * Uses AuthContext, MessagingContext, and react-router
 * @module components/common/Header.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  appUser: { full_name: 'Alice Manager', email: 'alice@test.com' },
  unreadCount: 0,
  navigateFn: vi.fn(),
  getPendingCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: mocks.appUser,
    signOut: mocks.signOut,
    availableOrchards: [],
    orchardId: '',
    switchOrchard: vi.fn(),
  }),
}));
vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({ unreadCount: mocks.unreadCount }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigateFn,
}));
vi.mock('@/services/offline.service', () => ({
  offlineService: { getPendingCount: mocks.getPendingCount },
}));
vi.mock('@/services/config.service', () => ({
  getConfig: () => ({ SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'k' }),
}));
// Foto propia: enlace firmado (null = iniciales); sin Supabase en este test
vi.mock('@/hooks/useAvatarUrl', () => ({
  useAvatarSignedUrl: (path: string | null | undefined) => (path ? `signed:${path}` : null),
  useUserAvatarUrl: () => null,
}));
// «Mi cuenta» (chunk aparte): basta con saber que se abre y se cierra
vi.mock('./account/AccountSheet', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="My account">
      <button onClick={onClose}>close-account</button>
    </div>
  ),
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unreadCount = 0;
    mocks.appUser = { full_name: 'Alice Manager', email: 'alice@test.com' };
  });

  it('renders title and subtitle', () => {
    render(<Header title="HarvestPro" subtitle="Manager Dashboard" />);
    expect(screen.getByText('HarvestPro')).toBeTruthy();
    expect(screen.getByText('Manager Dashboard')).toBeTruthy();
  });

  it('displays user initials from full name', () => {
    render(<Header title="HP" subtitle="test" />);
    expect(screen.getByText('AM')).toBeTruthy(); // Alice Manager → AM
  });

  it('renders sign-out button', () => {
    render(<Header title="HP" subtitle="test" />);
    const buttons = screen.getAllByRole('button');
    const signOutBtn = buttons.find(b => b.getAttribute('title') === 'Sign Out');
    expect(signOutBtn).toBeTruthy();
  });

  it('renders notification bell', () => {
    render(<Header title="HP" subtitle="test" />);
    const bellBtn = screen
      .getAllByRole('button')
      .find(b => b.getAttribute('title') === 'Notifications');
    expect(bellBtn).toBeTruthy();
  });

  it('shows unread badge when count > 0', () => {
    mocks.unreadCount = 5;
    render(<Header title="HP" subtitle="test" />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows 99+ when unread > 99', () => {
    mocks.unreadCount = 150;
    render(<Header title="HP" subtitle="test" />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('calls onProfileClick when avatar is clicked', () => {
    const onProfile = vi.fn();
    render(<Header title="HP" subtitle="test" onProfileClick={onProfile} />);
    const avatar = screen.getByText('AM');
    fireEvent.click(avatar);
    expect(onProfile).toHaveBeenCalled();
  });

  it('renders header element', () => {
    render(<Header title="HP" subtitle="test" />);
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('handles user with single name', () => {
    mocks.appUser = { full_name: 'Admin', email: 'admin@test.com' };
    render(<Header title="HP" subtitle="test" />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  // «Mi cuenta» (revisión 2026-10-21, #10): sin onProfileClick el avatar abre la pantalla personal
  it('opens My account from the avatar when the page passes no onProfileClick', async () => {
    render(<Header title="HP" subtitle="test" />);
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open my account' }));
    expect(await screen.findByRole('dialog', { name: 'My account' })).toBeTruthy();
    fireEvent.click(screen.getByText('close-account'));
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
  });

  it('does not open My account when the page handles the avatar itself', () => {
    const onProfile = vi.fn();
    render(<Header title="HP" subtitle="test" onProfileClick={onProfile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open profile settings' }));
    expect(onProfile).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
  });

  it('shows the profile photo instead of initials when the user has one', () => {
    mocks.appUser = { full_name: 'Alice Manager', email: 'alice@test.com', avatar_url: 'u1/avatar-1.jpg' } as typeof mocks.appUser;
    render(<Header title="HP" subtitle="test" />);
    const img = screen.getByRole('img', { name: 'Alice Manager' });
    expect(img.getAttribute('src')).toBe('signed:u1/avatar-1.jpg');
    expect(screen.queryByText('AM')).toBeNull();
  });
});
