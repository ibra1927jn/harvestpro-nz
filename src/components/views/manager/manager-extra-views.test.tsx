/**
 * Batch smoke tests for untested manager views:
 * MPIExportView (191L), APIKeysView (249L), AnomalyDetectionView (204L), OrchardMapView (170L)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ═══ Global mocks ═══
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { id: 'u1', full_name: 'Manager', role: 'manager', orchard_id: 'o1' },
    orchardId: 'o1',
    session: { user: { id: 'u1' } },
  }),
}));

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: (selector: (s: unknown) => unknown) =>
    typeof selector === 'function'
      ? selector({
          orchard: { id: 'o1', name: 'Test Orchard' },
          openPickerProfile: vi.fn(),
          crew: [],
          rows: [],
          settings: {},
        })
      : {
          orchard: { id: 'o1', name: 'Test Orchard' },
          openPickerProfile: vi.fn(),
          crew: [],
          rows: [],
          settings: {},
        },
}));

vi.mock('@/services/mpi-export.service', () => ({
  mpiExportService: {
    checkReadiness: vi.fn().mockResolvedValue({ ready: true, score: 95, topMissingFields: [] }),
    generateBatch: vi.fn().mockResolvedValue({ id: 'b1', records: 10 }),
    downloadCSV: vi.fn(),
  },
}));

vi.mock('@/services/api-keys.service', () => ({
  apiKeysService: {
    listKeys: vi.fn().mockResolvedValue([]),
    createKey: vi.fn().mockResolvedValue({ key: 'sk_test_123', id: 'k2' }),
    revokeKey: vi.fn().mockResolvedValue(undefined),
    getAvailableScopes: vi.fn().mockReturnValue(['harvest:read', 'harvest:write']),
  },
}));

vi.mock('@/services/fraud-detection.service', () => ({
  fraudDetectionService: {
    fetchAnomalies: vi.fn().mockResolvedValue([]),
    getDismissedExamples: vi.fn().mockReturnValue([]),
    dismissAnomaly: vi.fn(),
  },
}));

vi.mock('./anomaly/AnomalyCard', () => ({ default: () => <div data-testid="anomaly-card" /> }));
vi.mock('./anomaly/SmartDismissals', () => ({
  default: () => <div data-testid="smart-dismissals" />,
}));
vi.mock('./anomaly/anomaly.constants', () => ({
  FILTER_LABELS: { all: 'All', velocity: 'Speed', location: 'Location' },
}));

vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/useOrchardMap', () => ({
  useOrchardMap: () => ({
    rows: [{ id: 'r1', row_number: 1, variety: 'Hayward' }],
    loading: false,
    map: { totalBuckets: 10, rows: [{ id: 'r1' }] },
  }),
}));

// ═══ Tests ═══
describe('MPIExportView', () => {
  it('renders without crashing', async () => {
    const { default: MPIExportView } = await import('./MPIExportView');
    const { container } = render(<MPIExportView />);
    expect(container.firstChild).not.toBeNull();
  });
});

describe('APIKeysView', () => {
  it('renders without crashing', async () => {
    const { default: APIKeysView } = await import('./APIKeysView');
    const { container } = render(<APIKeysView />);
    expect(container.firstChild).not.toBeNull();
  });

  it('shows key dates in NZ format, not the device locale (5 March is not 3 May)', async () => {
    const { apiKeysService } = await import('@/services/api-keys.service');
    vi.mocked(apiKeysService.listKeys).mockResolvedValueOnce([{
      id: 'k1', name: 'Xero', key_prefix: 'hp_live_ab', scopes: ['harvest:read'], is_active: true,
      created_at: '2026-03-05T10:00:00Z', last_used_at: null, expires_at: null, request_count: 3,
    } as unknown as Awaited<ReturnType<typeof apiKeysService.listKeys>>[number]]);
    const { default: APIKeysView } = await import('./APIKeysView');
    render(<APIKeysView />);
    expect(await screen.findByText('Created 05/03/2026')).toBeTruthy();
  });
});

describe('AnomalyDetectionView', () => {
  it('renders without crashing', async () => {
    const mod = await import('./AnomalyDetectionView');
    const AnomalyDetectionView = mod.default;
    const { container } = render(<AnomalyDetectionView />);
    expect(container.firstChild).not.toBeNull();
  });
});

// OrchardMapView skipped — requires complex hook state from useOrchardMap
