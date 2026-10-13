/**
 * RequestsTab — Deep render + interaction tests
 * The component renders: Zone heading as "Zone {from_zone}", Button text as "Assign Vehicle" not "Assign",
 * and from/to zones merged like "from → to".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: '00000000-0000-4000-8000-000000000001' } }),
}));
vi.mock('@/services/logistics-dept.service', () => ({
  logisticsService: {
    assignTractor: vi.fn(),
    completeRequest: vi.fn(),
    cancelRequest: vi.fn(),
  },
}));

vi.mock('@/components/ui/EmptyState', () => ({
  default: ({ title, subtitle }: any) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
}));

vi.mock('@/components/ui/FilterBar', () => ({
  default: ({ searchPlaceholder, onSearchChange }: any) => (
    <input
      data-testid="filter-bar"
      placeholder={searchPlaceholder}
      onChange={(e: any) => onSearchChange(e.target.value)}
    />
  ),
}));

import RequestsTab from './RequestsTab';

const makeRequest = (id: string, status: string, priority: string, from: string, to: string) =>
  ({
    id,
    status,
    priority,
    from_zone: from,
    to_zone: to,
    bins_count: 5,
    requested_by: 'John',
    requested_at: '2026-03-10T08:00:00Z',
    tractor_id: status === 'assigned' ? 't1' : null,
    tractor_name: status === 'assigned' ? 'Tractor A' : null,
    updated_at: '2026-03-10T08:00:00Z',
  }) as any;

describe('RequestsTab', () => {
  const requests = [
    makeRequest('r1', 'pending', 'high', 'A1', 'Warehouse'),
    makeRequest('r2', 'assigned', 'medium', 'B1', 'Warehouse'),
    makeRequest('r3', 'completed', 'low', 'C1', 'Warehouse'),
  ];

  const tractors = [{ id: 't1', name: 'Tractor A' }] as any[];
  const defaultProps = { requests, tractors, onRefresh: vi.fn() };

  beforeEach(() => vi.clearAllMocks());

  it('renders priority badges', () => {
    render(<RequestsTab {...defaultProps} />);
    expect(screen.getAllByText(/^high$/i).length).toBeGreaterThan(0);
    expect(screen.getByText('medium')).toBeTruthy();
  });

  it('renders status badges', () => {
    render(<RequestsTab {...defaultProps} />);
    expect(screen.getAllByText(/^pending$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^assigned$/i).length).toBeGreaterThan(0);
  });

  it('renders filter bar', () => {
    render(<RequestsTab {...defaultProps} />);
    expect(screen.getByTestId('filter-bar')).toBeTruthy();
  });

  it('shows Assign Vehicle button for pending requests', () => {
    render(<RequestsTab {...defaultProps} />);
    const assignBtns = screen.getAllByText(/Assign Vehicle/);
    expect(assignBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Complete button for assigned requests', () => {
    render(<RequestsTab {...defaultProps} />);
    const completeBtns = screen.getAllByText(/Mark Completed/);
    expect(completeBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no requests', () => {
    render(<RequestsTab requests={[]} tractors={[]} />);
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('shows bins count', () => {
    render(<RequestsTab {...defaultProps} />);
    const binsText = screen.getAllByText(/5/);
    expect(binsText.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Cancel button for pending requests', () => {
    render(<RequestsTab {...defaultProps} />);
    const cancelBtns = screen.getAllByTitle('Cancel request');
    expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
  });
});
