/**
 * QualityControl Page Tests
 *
 * Verifies: renders QC header, bottom nav, loading state
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Prevent jsdom crash: OrchardSwitcher calls location.reload() which jsdom doesn't implement
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: vi.fn() },
    writable: true,
  });
});

// ── Mocks ────────────────────────────────────────────
vi.mock('@/stores/useHarvestStore', () => {
  const state = {
    crew: [{ id: 'p1', name: 'Picker A' }],
    orchard: { id: 'orch-1', name: 'Test Orchard' },
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
    appUser: { id: 'u1', full_name: 'QC Inspector', role: 'qc_inspector' },
    signOut: vi.fn(),
    isAuthenticated: true,
  }),
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({ unreadCount: 2 }),
}));
vi.mock('@/components/common/messaging/ChatTabView', () => ({
  default: () => <div data-testid="chat-tab">Chat</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/services/offline.service', () => ({
  offlineService: { getPendingCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('@/services/qc.service', () => ({
  qcService: {
    getInspections: vi.fn().mockResolvedValue([]),
    getGradeDistribution: vi.fn().mockResolvedValue({ A: 5, B: 3, C: 1, reject: 0, total: 9 }),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/views/qc/InspectTab', () => ({
  default: () => <div data-testid="inspect-tab">Inspect Tab</div>,
}));
vi.mock('@/components/views/qc/HistoryTab', () => ({
  default: () => <div>History Tab</div>,
}));
vi.mock('@/components/views/qc/StatsTab', () => ({
  default: () => <div>Stats Tab</div>,
}));
vi.mock('@/components/views/qc/TrendsTab', () => ({
  default: () => <div>Trends Tab</div>,
}));
vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/LoadingSkeleton', () => ({
  default: () => <div data-testid="loading-skeleton">Loading...</div>,
}));
vi.mock('@/components/common/NotificationPanel', () => ({
  default: () => <div>Notifications</div>,
}));
vi.mock('@/components/ui/ThemeToggle', () => ({
  default: () => <div>Theme</div>,
}));

// Fix worker crash: OrchardSwitcher calls location.reload() via its hook,
// which jsdom cannot simulate and kills the vitest worker process.
vi.mock('@/components/common/OrchardSwitcher', () => ({
  default: () => null,
}));

import QualityControl from './QualityControl';

describe('QualityControl Page', () => {
  it('renders without crashing', () => {
    const { container } = render(<QualityControl />);
    expect(container).toBeTruthy();
  });

  it('renders the header with Quality Control title after load', async () => {
    render(<QualityControl />);
    const titles = await screen.findAllByText('Quality Control');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('renders bottom navigation tabs after load', async () => {
    render(<QualityControl />);
    const inspectTab = await screen.findByText('Inspect');
    expect(inspectTab).toBeTruthy();
  });

  it('shows inspect tab content as default after load', async () => {
    render(<QualityControl />);
    const inspectContent = await screen.findByTestId('inspect-tab');
    expect(inspectContent).toBeTruthy();
  });

  it('QC has the chat tab too, with the unread count', async () => {
    render(<QualityControl />);
    const tabs = await screen.findAllByRole('button', { name: 'Chat (2)' });
    fireEvent.click(tabs[0]);
    expect(await screen.findByTestId('chat-tab')).toBeInTheDocument();
  });
});
