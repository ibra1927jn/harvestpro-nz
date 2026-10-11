/**
 * RunnersView — Deep render tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockStore = {
  crew: [
    {
      id: 'p1',
      name: 'Alice',
      avatar: 'AL',
      current_row: 3,
      total_buckets_today: 15,
      status: 'active',
      check_in: '2026-10-12T07:00:00+13:00', // fichado hoy → cuenta como presente
    },
    {
      id: 'p2',
      name: 'Bob',
      avatar: 'BO',
      current_row: 1,
      total_buckets_today: 8,
      status: 'active',
      check_in: '2026-10-12T07:00:00+13:00',
    },
    {
      id: 'p3',
      name: 'Carl Gone',
      avatar: 'CG',
      current_row: 2,
      total_buckets_today: 3,
      status: 'active',
      check_in: '2026-10-12T07:00:00+13:00',
      check_out: '2026-10-12T11:00:00+13:00', // ya se fue → no cuenta
    },
    {
      id: 'tl',
      name: 'Team Leader',
      avatar: 'TL',
      current_row: 0,
      total_buckets_today: 0,
      status: 'active',
      role: 'team_leader',
      check_in: '2026-10-12T07:00:00+13:00', // no es picker → no cuenta
    },
  ],
  orchard: { name: 'Sunny Orchard' },
};

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: () => mockStore,
}));

import RunnersView from './RunnersView';

describe('RunnersView', () => {
  const onBack = vi.fn();

  it('renders Orchard Crew heading', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('Orchard Crew')).toBeTruthy();
  });

  it('renders orchard name', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('Sunny Orchard')).toBeTruthy();
  });

  it('renders Active Pickers heading', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('Active Pickers')).toBeTruthy();
  });

  it('shows checked-in count', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('2 Checked In')).toBeTruthy();
  });

  it('renders picker names', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders picker avatars', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('AL')).toBeTruthy();
    expect(screen.getByText('BO')).toBeTruthy();
  });

  it('renders bucket counts', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('renders row assignments', () => {
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('Row 3')).toBeTruthy();
    expect(screen.getByText('Row 1')).toBeTruthy();
  });

  it('calls onBack when back button is clicked', () => {
    render(<RunnersView onBack={onBack} />);
    fireEvent.click(screen.getByText('arrow_back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows empty state when no pickers', () => {
    const _emptyStore = { crew: [], orchard: { name: 'Empty Orchard' } };
    vi.mocked(mockStore).crew = [];
    render(<RunnersView onBack={onBack} />);
    expect(screen.getByText('No Active Pickers')).toBeTruthy();
    // Restore
    vi.mocked(mockStore).crew = [
      {
        id: 'p1',
        name: 'Alice',
        avatar: 'AL',
        current_row: 3,
        total_buckets_today: 15,
        status: 'active',
      },
      {
        id: 'p2',
        name: 'Bob',
        avatar: 'BO',
        current_row: 1,
        total_buckets_today: 8,
        status: 'active',
      },
    ] as any;
  });
});
