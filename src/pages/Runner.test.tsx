/**
 * Runner Page Tests
 *
 * Verifies: renders header, bottom nav tabs, default logistics view
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => {
  const state = {
    fetchGlobalData: vi.fn(),
    orchard: { id: 'orch-1', name: 'Test Orchard', bucket_rate: 3.5 },
    crew: [],
    todayBuckets: [],
    collections: [],
    inventory: [],
    fetchTodayBuckets: vi.fn(),
    fetchCollections: vi.fn(),
    addBucket: vi.fn(),
  };
  return {
    useHarvestStore: vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Test Runner', role: 'runner' },
    signOut: vi.fn(),
    isAuthenticated: true,
    availableOrchards: [],
    orchardId: 'test-orchard',
    switchOrchard: vi.fn(),
  }),
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({ unreadCount: 0, sendBroadcast: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/services/offline.service', () => ({
  offlineService: { getPendingCount: vi.fn().mockResolvedValue(0), getErrorItems: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/utils/nzst', () => ({
  nowNZST: () => new Date('2026-03-07T10:00:00+13:00'),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/feedback.service', () => ({
  feedbackService: { vibrate: vi.fn(), triggerSuccess: vi.fn() },
}));

vi.mock('../components/views/runner/LogisticsView', () => ({
  default: () => <div data-testid="logistics-view">Logistics View</div>,
}));
vi.mock('../components/views/runner/WarehouseView', () => ({
  default: () => <div>Warehouse View</div>,
}));
vi.mock('../components/views/runner/MessagingView', () => ({
  default: () => <div>Messaging View</div>,
}));
vi.mock('../components/views/runner/RunnersView', () => ({
  default: () => <div>Runners View</div>,
}));
const loaded = vi.hoisted(() => new Set<string>());
vi.mock('../components/modals/QualityRatingModal', () => {
  loaded.add('quality');
  return { default: () => <div>Quality Modal</div> };
});
vi.mock('../components/modals/ScannerModal', () => {
  loaded.add('scanner');
  return { default: () => <div>Scanner Modal</div> };
});
vi.mock('@/components/ui/Toast', () => ({
  default: () => <div>Toast</div>,
}));
vi.mock('../components/common/SyncStatusMonitor', () => ({
  default: () => <div>Sync Monitor</div>,
}));
vi.mock('../components/views/runner/MyTimesheetView', () => ({
  default: () => <div>My Timesheet View</div>,
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

import Runner from './Runner';

describe('Runner Page', () => {
  it('renders the header with Runner title', () => {
    render(<Runner />);
    expect(screen.getAllByText('Runner').length).toBeGreaterThan(0);
  });

  it('shows Logistics view by default', async () => {
    render(<Runner />);
    expect(await screen.findByTestId('logistics-view')).toBeTruthy();
  });

  it('loads the scanner up front, so it opens without signal later', async () => {
    render(<Runner />);
    await waitFor(() => expect([...loaded].sort()).toEqual(['quality', 'scanner']));
    expect(screen.queryByText('Scanner Modal')).toBeNull();
  });

  it('renders bottom navigation tabs', () => {
    render(<Runner />);
    expect(screen.getAllByText('Logistics').length).toBeGreaterThan(0);
    expect(screen.getByText('Warehouse')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });
});
