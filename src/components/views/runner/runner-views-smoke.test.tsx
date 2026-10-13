/**
 * Smoke tests for runner views — LogisticsView (265L) and WarehouseView (116L)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});

describe('WarehouseView', () => {
  let WarehouseView: React.ComponentType<{
    inventory?: { full_bins: number; empty_bins: number; in_progress: number; total: number };
    onTransportRequest?: () => void;
  }>;

  beforeAll(async () => {
    const mod = await import('./WarehouseView');
    WarehouseView = mod.default;
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
  });
});
