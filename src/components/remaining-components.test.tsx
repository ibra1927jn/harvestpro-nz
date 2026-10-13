/**
 * Tests for DesktopLayout
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Global mocks ────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((selector) => {
        const state = {
            currentUser: { id: 'u1', full_name: 'Admin', role: 'manager', email: 'admin@test.com' },
            orchardId: 'orchard1',
            pickers: [],
            daySettings: { piece_rate_per_bucket: 3.0, minimum_wage: 23.5 },
            rowAssignments: {},
        };
        return typeof selector === 'function' ? selector(state) : state;
    }),
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'u1', user_metadata: { full_name: 'Admin' } },
        userRole: 'manager',
        signOut: vi.fn(),
    }),
}));

vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => ({ unreadCount: 0, conversations: [] }),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));




// ── DesktopLayout ───────────────────────────────────
import DesktopLayout from './common/DesktopLayout';

describe('DesktopLayout', () => {
    const defaultProps = {
        navItems: [
            { id: 'home', label: 'Home', icon: 'dashboard' },
            { id: 'team', label: 'Team', icon: 'people', badge: 3 },
        ],
        activeTab: 'home',
        onTabChange: vi.fn(),
        title: 'Test Dashboard',
        children: <p>Content Area</p>,
    };

    it('renders children content', () => {
        render(<DesktopLayout {...defaultProps} />);
        expect(screen.getByText('Content Area')).toBeTruthy();
    });

    it('renders title in multiple places', () => {
        render(<DesktopLayout {...defaultProps} />);
        const titles = screen.getAllByText('Test Dashboard');
        expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    it('renders nav items', () => {
        render(<DesktopLayout {...defaultProps} />);
        const homeItems = screen.getAllByText('Home');
        expect(homeItems.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Team')).toBeTruthy();
    });

    it('renders badge on nav item', () => {
        render(<DesktopLayout {...defaultProps} />);
        expect(screen.getByText('3')).toBeTruthy();
    });

    it('calls onTabChange when nav item clicked', () => {
        const onTabChange = vi.fn();
        render(<DesktopLayout {...defaultProps} onTabChange={onTabChange} />);
        fireEvent.click(screen.getByText('Team'));
        expect(onTabChange).toHaveBeenCalledWith('team');
    });

    it('renders HarvestPro brand', () => {
        render(<DesktopLayout {...defaultProps} />);
        expect(screen.getByText('HarvestPro')).toBeTruthy();
    });
});
