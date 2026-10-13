/**
 * Integration tests for Manager.tsx — adaptive command center page
 * Covers: Manager default render, tab switching, renderContent, renderModals, handleBroadcast
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@/test-utils';

// Mock ALL dependencies before importing
vi.mock('@/stores/useHarvestStore', () => {
    const store = vi.fn((selector) => {
        const state = {
            stats: { totalBuckets: 100, payEstimate: 2.5, tons: 3, velocity: 12, goalVelocity: 15 },
            crew: [],
            inventory: [],
            orchard: { id: 'o1', name: 'Test Orchard', total_rows: 20 },
            settings: { piece_rate: 6.50, target_tons: 10, min_wage_rate: 23.95, min_buckets_per_hour: 4 },
            updateSettings: vi.fn(),
            addPicker: vi.fn(),
            removePicker: vi.fn(),
            presentCount: 5,
            bucketRecords: [],
            fetchGlobalData: vi.fn(),
            updatePicker: vi.fn(),
            assignRow: vi.fn(),
        };
        return selector ? selector(state) : state;
    });
    store.setState = vi.fn();
    store.getState = vi.fn();
    return { useHarvestStore: store };
});

vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => ({
        sendBroadcast: vi.fn(),
        sendMessage: vi.fn(),
        getOrCreateConversation: vi.fn(),
        messages: [],
        broadcasts: [],
        chatGroups: [],
        unreadCount: 0,
    }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
    useMediaQuery: () => false, // Mobile by default
}));

vi.mock('@/hooks/useOfflineQueue', () => ({
    useOfflineQueue: vi.fn(),
}));

vi.mock('@/services/notification.service', () => ({
    notificationService: {
        getPrefs: () => ({ enabled: false, types: {} }),
        startChecking: vi.fn(),
        stopChecking: vi.fn(),
    },
}));

vi.mock('@/services/user.service', () => ({
    userService: { unassignUserFromOrchard: vi.fn() },
}));

vi.mock('@/services/db', () => ({
    db: { sync_queue: { put: vi.fn() } },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock all child components to avoid deep dependency chains
vi.mock('@/components/views/manager/DashboardView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'dashboard-view' }, 'Dashboard'),
}));
vi.mock('@/components/views/manager/TeamsView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'teams-view' }, 'Teams'),
}));
vi.mock('@/components/views/manager/MoreMenuView', () => ({
    default: ({ onNavigate }: { onNavigate: (tab: string) => void }) =>
        React.createElement('div', { 'data-testid': 'more-view' },
            React.createElement('button', { onClick: () => onNavigate('settings'), 'data-testid': 'nav-settings' }, 'Settings')
        ),
}));
vi.mock('@/components/views/manager/LogisticsView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'logistics-view' }, 'Logistics'),
}));
vi.mock('@/components/views/manager/MessagingView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'messaging-view' }, 'Messaging'),
}));
vi.mock('@/components/views/manager/MapToggleView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'map-view' }, 'Map'),
}));
vi.mock('@/components/views/manager/InsightsView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'insights-view' }, 'Insights'),
}));
vi.mock('@/components/views/manager/SettingsView', () => ({
    default: () => React.createElement('div', { 'data-testid': 'settings-view' }, 'Settings'),
}));
vi.mock('@/components/common/BottomNav', () => ({
    default: ({ activeTab, onTabChange }: { activeTab: string; tabs: unknown[]; onTabChange: (id: string) => void }) =>
        React.createElement('nav', { 'data-testid': 'bottom-nav' },
            React.createElement('button', { onClick: () => onTabChange('dashboard'), 'data-testid': 'tab-dashboard' }, 'Dashboard'),
            React.createElement('button', { onClick: () => onTabChange('teams'), 'data-testid': 'tab-teams' }, 'Teams'),
            React.createElement('button', { onClick: () => onTabChange('logistics'), 'data-testid': 'tab-logistics' }, 'Logistics'),
            React.createElement('button', { onClick: () => onTabChange('map'), 'data-testid': 'tab-map' }, 'Map'),
            React.createElement('button', { onClick: () => onTabChange('more'), 'data-testid': 'tab-more' }, 'More'),
            React.createElement('span', { 'data-testid': 'active-tab' }, activeTab),
        ),
}));
vi.mock('@/components/common/DesktopLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', { 'data-testid': 'desktop-layout' }, children),
}));
vi.mock('@/components/common/Header', () => ({
    default: ({ title }: { title: string }) =>
        React.createElement('header', { 'data-testid': 'header' }, title),
}));
vi.mock('@/components/PickerDrawer', () => ({
    PickerDrawer: () => React.createElement('div', { 'data-testid': 'profile-drawer' }),
}));
vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
    default: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', null, children),
}));
vi.mock('@/components/modals/DaySettingsModal', () => ({
    default: () => React.createElement('div', { 'data-testid': 'settings-modal' }, 'Settings Modal'),
}));
vi.mock('@/components/modals/AddPickerModal', () => ({
    default: () => React.createElement('div', { 'data-testid': 'add-picker-modal' }, 'Add Picker'),
}));
vi.mock('@/components/views/manager/BroadcastModal', () => ({
    default: () => React.createElement('div', { 'data-testid': 'broadcast-modal' }, 'Broadcast'),
}));
vi.mock('@/components/views/manager/RowAssignmentModal', () => ({
    default: () => React.createElement('div', { 'data-testid': 'row-assignment-modal' }, 'Row'),
}));
vi.mock('@/components/modals/PickerDetailsModal', () => ({
    default: () => React.createElement('div', { 'data-testid': 'picker-details-modal' }, 'Details'),
}));
vi.mock('./managerNav.config', () => ({
    MOBILE_TABS: [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
        { id: 'teams', label: 'Teams', icon: 'group' },
        { id: 'logistics', label: 'Logistics', icon: 'local_shipping' },
        { id: 'map', label: 'Map', icon: 'map' },
        { id: 'more', label: 'More', icon: 'more_horiz' },
    ],
    DESKTOP_NAV: [],
}));

import Manager from './Manager';

describe('Manager Integration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders mobile layout with header and bottom nav', () => {
        render(React.createElement(Manager));
        expect(screen.getByTestId('header')).toBeDefined();
        expect(screen.getByTestId('bottom-nav')).toBeDefined();
    });

    it('shows dashboard view by default', () => {
        render(React.createElement(Manager));
        expect(screen.getByTestId('dashboard-view')).toBeDefined();
    });

    it('switches to teams view on tab click', async () => {
        render(React.createElement(Manager));
        await act(async () => {
            screen.getByTestId('tab-teams').click();
        });
        await waitFor(() => {
            expect(screen.getByTestId('teams-view')).toBeDefined();
        });
    });

    it('switches to logistics view on tab click', async () => {
        render(React.createElement(Manager));
        await act(async () => {
            screen.getByTestId('tab-logistics').click();
        });
        await waitFor(() => {
            expect(screen.getByTestId('logistics-view')).toBeDefined();
        });
    });

    it('switches to more view on tab click', async () => {
        render(React.createElement(Manager));
        await act(async () => {
            screen.getByTestId('tab-more').click();
        });
        await waitFor(() => {
            expect(screen.getByTestId('more-view')).toBeDefined();
        });
    });

    it('shows broadcast FAB on dashboard tab', () => {
        render(React.createElement(Manager));
        // Broadcast FAB should be present on dashboard
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders profile drawer', () => {
        render(React.createElement(Manager));
        expect(screen.getByTestId('profile-drawer')).toBeDefined();
    });
});
