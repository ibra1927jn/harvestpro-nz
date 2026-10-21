/**
 * Smoke tests for runner views — LogisticsView (265L) and WarehouseView (116L)
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: (selector: (s: unknown) => unknown) =>
    selector({
      buckets: [
        { orchard_id: 'offline_pending', id: 'b1' },
        { orchard_id: 'o1', id: 'b2' },
      ],
      stats: { totalBuckets: 10 },
    }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toast: null,
    showToast: vi.fn(),
    hideToast: vi.fn(),
  }),
}));

describe('runner LogisticsView', () => {
  let LogisticsView: React.ComponentType<{
    onScan: (type?: 'BIN' | 'BUCKET') => void;
    pendingUploads?: number;
    rejectedScans?: { id: string; picker_id: string; timestamp: string; reason: string }[];
    inventory?: { empty_bins?: number; raw?: { status: string }[] };
  }>;

  beforeAll(async () => {
    const mod = await import('./LogisticsView');
    LogisticsView = mod.default;
  });

  it('renders scan button area', () => {
    const onScan = vi.fn();
    const { container } = render(<LogisticsView onScan={onScan} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders with inventory data', () => {
    const onScan = vi.fn();
    const { container } = render(
      <LogisticsView onScan={onScan} inventory={{ empty_bins: 5, raw: [{ status: 'full' }] }} />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('shows pending uploads badge', () => {
    const onScan = vi.fn();
    const { container } = render(<LogisticsView onScan={onScan} pendingUploads={3} />);
    expect(container.innerHTML).toContain('3');
  });

  it('shows scans the server did not accept, with the reason on tap', () => {
    render(
      <LogisticsView
        onScan={vi.fn()}
        rejectedScans={[
          { id: 's1', picker_id: 'LOC-018', timestamp: '2026-10-12T10:01:00+13:00', reason: 'PAY_WEEK_CLOSED: the pay week of this bucket is closed.' },
          { id: 's2', picker_id: 'LOC-020', timestamp: '2026-10-12T10:02:00+13:00', reason: 'UNKNOWN_BADGE: "LOC-020"' },
        ]}
      />
    );
    const notice = screen.getByTestId('rejected-scans');
    expect(notice).toHaveTextContent('2 scans not accepted');
    expect(notice).not.toHaveTextContent('PAY_WEEK_CLOSED');
    fireEvent.click(screen.getByRole('button', { name: /2 scans not accepted/ }));
    expect(notice).toHaveTextContent('LOC-018 · 2026-10-12 10:01 · PAY_WEEK_CLOSED');
    expect(notice).toHaveTextContent('UNKNOWN_BADGE');
  });
});

const warehouseHook = vi.hoisted(() => ({
  zones: [] as unknown[],
  myRequests: [] as unknown[],
  loading: false,
  reload: vi.fn(),
  cancelMine: vi.fn(),
}));
vi.mock('@/hooks/useRunnerWarehouse', () => ({ useRunnerWarehouse: () => warehouseHook }));

describe('WarehouseView', () => {
  let WarehouseView: React.ComponentType<{
    inventory?: { full_bins: number; empty_bins: number; in_progress: number; total: number };
    onTransportRequest?: () => void;
  }>;

  beforeAll(async () => {
    const mod = await import('./WarehouseView');
    WarehouseView = mod.default;
  });

  beforeEach(() => {
    warehouseHook.zones = [];
    warehouseHook.myRequests = [];
    warehouseHook.loading = false;
    warehouseHook.cancelMine.mockClear();
  });

  it('renders warehouse inventory header', () => {
    render(<WarehouseView />);
    expect(screen.getByText('Warehouse Inventory')).toBeDefined();
  });

  it('renders bin counts', () => {
    render(
      <WarehouseView inventory={{ full_bins: 10, empty_bins: 5, in_progress: 2, total: 17 }} />
    );
    expect(screen.getByText('10')).toBeDefined();
  });

  it('renders empty state with defaults', () => {
    const { container } = render(<WarehouseView />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('No Warehouse Inventory')).toBeDefined();
    expect(screen.getByText(/No open requests/)).toBeDefined();
  });

  it('mis solicitudes con estado real; solo las pendientes se pueden cancelar', () => {
    warehouseHook.myRequests = [
      { id: 'q1', requested_by: 'me', requester_name: 'Me', zone: 'Row 4', bins_count: 2, priority: 'normal', status: 'pending', created_at: '2026-10-12T09:00:00+13:00' },
      { id: 'q2', requested_by: 'me', requester_name: 'Me', zone: 'Row 9', bins_count: 1, priority: 'normal', status: 'assigned', assigned_tractor: 't1', created_at: '2026-10-12T08:00:00+13:00' },
    ];
    render(<WarehouseView inventory={{ full_bins: 1, empty_bins: 9, in_progress: 0, total: 10 }} />);
    expect(screen.getAllByTestId('my-request')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByText('Assigned')).toBeDefined();
    expect(screen.getByText(/vehicle assigned/)).toBeDefined();
    const cancelButtons = screen.getAllByLabelText('Cancel request');
    expect(cancelButtons).toHaveLength(1);
    fireEvent.click(cancelButtons[0]);
    expect(warehouseHook.cancelMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }));
  });

  it('bins agrupados por zona con su estado', () => {
    warehouseHook.zones = [
      { zone: 'B2', full: 2, empty: 1, bins: [
        { id: '1', bin_code: 'B2-01', status: 'full', zone: 'B2', fill_percentage: 100, last_scan: '' },
        { id: '2', bin_code: 'B2-02', status: 'full', zone: 'B2', fill_percentage: 100, last_scan: '' },
        { id: '3', bin_code: 'B2-03', status: 'empty', zone: 'B2', fill_percentage: 0, last_scan: '' },
      ] },
    ];
    render(<WarehouseView inventory={{ full_bins: 2, empty_bins: 1, in_progress: 0, total: 3 }} />);
    expect(screen.getByText('Zone B2')).toBeDefined();
    expect(screen.getByText('2 full · 1 empty')).toBeDefined();
    expect(screen.getByText('B2-01')).toBeDefined();
    expect(screen.getAllByTestId('zone-card')).toHaveLength(1);
  });

  it('no decorative bell nor fake "dispatch requested" text', () => {
    render(<WarehouseView inventory={{ full_bins: 20, empty_bins: 10, in_progress: 0, total: 30 }} />);
    expect(screen.queryByText(/Dispatch requested/)).toBeNull();
    expect(screen.queryByLabelText('Notifications')).toBeNull();
  });
});
