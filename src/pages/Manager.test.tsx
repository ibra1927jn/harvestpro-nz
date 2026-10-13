/**
 * Manager Page Tests
 *
 * Verifies: renders page shell with header, navigation, and default dashboard view
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => {
  const state = {
    fetchGlobalData: vi.fn(),
    orchard: {
      id: 'orch-1',
      name: 'Sunrise Orchard',
      bucket_rate: 3.5,
      daily_target_tons: 10,
      total_rows: 20,
    },
    crew: [],
    todayBuckets: [],
    collections: [],
    inventory: [],
    stats: { totalBuckets: 0, totalWeight: 0 },
    settings: { piece_rate: 3.5, target_tons: 10 },
    updateSettings: vi.fn(),
    addPicker: vi.fn(),
    removePicker: vi.fn(),
    presentCount: 0,
    bucketRecords: [],
    updatePicker: vi.fn(),
    assignRow: vi.fn(),
    fetchTodayBuckets: vi.fn(),
    fetchCollections: vi.fn(),
    addBucket: vi.fn(),
  };
  const useHarvestStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  }) as ReturnType<typeof vi.fn> & { setState: ReturnType<typeof vi.fn> };
  useHarvestStore.setState = vi.fn();
  return { useHarvestStore };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Test Manager', role: 'manager' },
    signOut: vi.fn(),
    isAuthenticated: true,
    availableOrchards: [],
    orchardId: 'test-orchard',
    switchOrchard: vi.fn(),
  }),
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({
    unreadCount: 0,
    sendMessage: vi.fn(),
    sendBroadcast: vi.fn(),
    getOrCreateConversation: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false, // render mobile layout
}));

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: vi.fn(),
}));

vi.mock('@/services/offline.service', () => ({
  offlineService: { getPendingCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('@/services/notification.service', () => ({
  notificationService: {
    getPrefs: () => ({ enabled: false }),
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
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock all views
vi.mock('@/components/views/manager/DashboardView', () => ({
  default: () => <div data-testid="dashboard-view">Dashboard View</div>,
}));
vi.mock('@/components/views/manager/TeamsView', () => ({
  default: () => <div>Teams</div>,
}));
vi.mock('@/components/views/manager/MoreMenuView', () => ({
  default: () => <div>More Menu</div>,
}));
vi.mock('@/components/views/manager/LogisticsView', () => ({
  default: () => <div>Logistics</div>,
}));
vi.mock('@/components/views/manager/MessagingView', () => ({
  default: () => <div>Messaging</div>,
}));
vi.mock('@/components/views/manager/MapToggleView', () => ({
  default: () => <div>Map</div>,
}));
vi.mock('@/components/views/manager/InsightsView', () => ({
  default: () => <div>Insights</div>,
}));
vi.mock('@/components/views/manager/SettingsView', () => ({
  default: () => <div>Settings</div>,
}));

// Mock all modals
vi.mock('@/components/modals/DaySettingsModal', () => ({
  default: () => <div>Day Settings</div>,
}));
vi.mock('@/components/modals/AddPickerModal', () => ({
  default: () => <div>Add Picker</div>,
}));
vi.mock('@/components/views/manager/BroadcastModal', () => ({
  default: () => <div>Broadcast</div>,
}));
vi.mock('@/components/views/manager/RowAssignmentModal', () => ({
  default: () => <div>Row Assignment</div>,
}));
vi.mock('@/components/modals/PickerDetailsModal', () => ({
  default: () => <div>Picker Details</div>,
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

import Manager from './Manager';

describe('Manager Page', () => {
  it('renders without crashing', () => {
    const { container } = render(<Manager />);
    expect(container).toBeTruthy();
  });

  it('renders the Harvest Manager title', () => {
    render(<Manager />);
    expect(screen.getAllByText('Harvest Manager').length).toBeGreaterThan(0);
  });

  it('renders the dashboard view by default', () => {
    render(<Manager />);
    expect(screen.getByTestId('dashboard-view')).toBeTruthy();
  });
});
