/**
 * Tests para el nuevo LogisticsView (§16 — panel de salud logística del manager).
 *
 * Verifica:
 * - Que los elementos de la versión anterior (botones, filtros, alerts) han sido eliminados.
 * - Que los nuevos sub-componentes se renderizan correctamente.
 * - Estado de carga (skeleton).
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useLogisticsHealth', () => ({
  useLogisticsHealth: vi.fn(() => ({
    health: 'green' as const,
    backlogSeries: [],
    avgPickup: 180,
    avgCycle: 300,
    runnerLeaderboard: [],
    recentEvents: [],
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useLogistics', () => ({
  useLogistics: () => ({
    requests: [],
    history: [],
    isLoading: false,
  }),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// ── Wrapper con contexto i18n ─────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

// ── Import del componente ─────────────────────────────────────────────────────

let LogisticsView: React.FC;

beforeAll(async () => {
  const mod = await import('./LogisticsView');
  LogisticsView = mod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LogisticsView — §16 refactor', () => {
  it('renders without crashing', () => {
    const { container } = render(<LogisticsView />, { wrapper });
    expect(container.firstChild).not.toBeNull();
  });

  it('renders LogisticsHealthBanner with green headline text', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.getByText('Logistics keeping up with harvest')).toBeDefined();
  });

  it('renders LogisticsHealthBanner status pill', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.getByText('On Track')).toBeDefined();
  });

  it('renders backlog chart section with empty state text', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.getByText('Bin Backlog')).toBeDefined();
    expect(screen.getByText('No backlog data yet')).toBeDefined();
  });

  it('renders SLA card with title', () => {
    render(<LogisticsView />, { wrapper });
    // El título "Avg Pickup Time" aparece dos veces (título + sub-label dentro de la tarjeta)
    const matches = screen.getAllByText('Avg Pickup Time');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders leaderboard empty state', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.getByText('Runner Leaderboard')).toBeDefined();
    expect(screen.getByText('No runner data yet')).toBeDefined();
  });

  it('renders events feed empty state', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.getByText('Recent Events')).toBeDefined();
    expect(screen.getByText('No recent events')).toBeDefined();
  });

  it('does NOT render "send bin full alert" button from old version', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.queryByText(/send.*bin.*full.*alert/i)).toBeNull();
  });

  it('does NOT render chat buttons from old runner list', () => {
    render(<LogisticsView />, { wrapper });
    const chatButtons = screen.queryAllByRole('button', { name: /chat/i });
    expect(chatButtons).toHaveLength(0);
  });

  it('does NOT render old filter pills (in queue, to bin, loading, returning)', () => {
    render(<LogisticsView />, { wrapper });
    expect(screen.queryByText(/^in queue$|^to bin$|^loading$|^returning$/i)).toBeNull();
  });

  it('renders skeleton cards when isLoading is true', async () => {
    const { useLogisticsHealth } = await import('@/hooks/useLogisticsHealth');
    vi.mocked(useLogisticsHealth).mockReturnValueOnce({
      health: 'green',
      backlogSeries: [],
      avgPickup: 0,
      avgCycle: 0,
      runnerLeaderboard: [],
      recentEvents: [],
      isLoading: true,
    });
    const { container } = render(<LogisticsView />, { wrapper });
    // CardSkeleton renderiza role="status" aria-busy="true"
    const skeletons = container.querySelectorAll('[role="status"][aria-busy="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
