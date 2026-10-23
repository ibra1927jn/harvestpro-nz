import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/common/account/UserAvatar', () => ({ default: () => null }));

import TeamLeaderCard from './TeamLeaderCard';
import type { Picker } from '@/types';
import type { LeaveRequest } from '@/services/leave.service';

const leader = { id: 'tl1', name: 'Tama', role: 'team_leader', total_buckets_today: 0 } as unknown as Picker;
const crew = [
  { id: 'p1', name: 'Aroha', role: 'picker', total_buckets_today: 3, hours: 1 },
  { id: 'p2', name: 'Rua', role: 'picker', total_buckets_today: 3, hours: 1, check_in: '2026-10-23T07:00:00+13:00' },
] as unknown as Picker[];

describe('TeamLeaderCard — leave', () => {
  it('shows "On leave (type)" for someone on approved leave who is not working', () => {
    const leave = new Map([
      ['p1', { picker_id: 'p1', type: 'sick' } as LeaveRequest],
      ['p2', { picker_id: 'p2', type: 'annual' } as LeaveRequest],
    ]);
    render(<TeamLeaderCard leader={leader} crew={crew} onSelectUser={vi.fn()} settings={null} leaveToday={leave} />);
    fireEvent.click(screen.getByText('Tama'));
    expect(screen.getByTestId('presence-p1').textContent).toContain('On leave (Sick leave)');
    // Rua tiene ausencia pero ha fichado: manda lo que está pasando
    expect(screen.getByTestId('presence-p2').getAttribute('data-presence')).toBe('on_shift');
    expect(screen.getByTestId('team-presence-tl1').textContent).toBe('1/2 in · 0 on break · 1 on leave');
  });
});
