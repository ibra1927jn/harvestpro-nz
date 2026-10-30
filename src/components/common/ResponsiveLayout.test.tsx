/**
 * ResponsiveLayout — en móvil la cabecera abre «Mi cuenta» por sí sola cuando la
 * página no pasa onProfileClick (así los 8 roles la tienen); en escritorio lo
 * hace DesktopLayout desde el avatar de la cabecera y del sidebar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ isDesktop: false }));

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => h.isDesktop }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Rangi Runner', email: 'r@o.nz', role: 'runner' },
    signOut: vi.fn(),
    availableOrchards: [],
    orchardId: 'o1',
    switchOrchard: vi.fn(),
  }),
}));
vi.mock('@/context/MessagingContext', () => ({ useMessaging: () => ({ unreadCount: 0 }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/services/offline.service', () => ({ offlineService: { getPendingCount: vi.fn().mockResolvedValue(0) } }));
vi.mock('@/hooks/useAvatarUrl', () => ({ useAvatarSignedUrl: () => null, useUserAvatarUrl: () => null }));
vi.mock('./NotificationPanel', () => ({ default: () => <div>Notifications</div> }));
vi.mock('@/components/ui/ThemeToggle', () => ({ default: () => <div>Theme</div> }));
vi.mock('./account/AccountSheet', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="My account"><button onClick={onClose}>close-account</button></div>
  ),
}));

import ResponsiveLayout from './ResponsiveLayout';

const tabs = [{ id: 'home', label: 'Home', icon: 'home' }, { id: 'scan', label: 'Scan', icon: 'qr_code_scanner' }];

const renderLayout = (extra: Partial<React.ComponentProps<typeof ResponsiveLayout>> = {}) =>
  render(
    <ResponsiveLayout navItems={tabs} mobileTabs={tabs} activeTab="home" onTabChange={vi.fn()} title="Runner" subtitle="Field" {...extra}>
      <div>content</div>
    </ResponsiveLayout>,
  );

beforeEach(() => {
  h.isDesktop = false;
});

describe('ResponsiveLayout → My account', () => {
  it('mobile: the header avatar opens My account when the page passes no onProfileClick', async () => {
    renderLayout();
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open my account' }));
    expect(await screen.findByRole('dialog', { name: 'My account' })).toBeTruthy();
    fireEvent.click(screen.getByText('close-account'));
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
  });

  it('mobile: a page that still passes onProfileClick keeps its own behaviour', () => {
    const onProfileClick = vi.fn();
    renderLayout({ onProfileClick });
    fireEvent.click(screen.getByRole('button', { name: 'Open profile settings' }));
    expect(onProfileClick).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'My account' })).toBeNull();
  });

  it('desktop: the header avatar and the sidebar user block open My account', async () => {
    h.isDesktop = true;
    renderLayout();
    const openers = screen.getAllByRole('button', { name: 'Open my account' });
    expect(openers.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(openers[0]);
    expect(await screen.findByRole('dialog', { name: 'My account' })).toBeTruthy();
  });
});
