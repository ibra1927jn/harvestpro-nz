/**
 * OrchardSwitcher: solo los roles de empresa / oficina cambian su propio
 * huerto (A5, migración 20261023013000); el personal de campo no lo ve.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }));

import OrchardSwitcher from './OrchardSwitcher';

const orchards = [
  { id: 'o1', name: 'North Block', total_rows: 10 },
  { id: 'o2', name: 'South Block', total_rows: 12 },
];

function as(role: string, list = orchards) {
  auth.current = {
    orchardId: 'o1', orchardName: 'North Block', availableOrchards: list,
    switchOrchard: vi.fn(), currentRole: role, appUser: { id: 'u1', role },
  };
}

describe('OrchardSwitcher', () => {
  beforeEach(() => { auth.current = {}; });

  it.each(['admin', 'manager', 'hr_admin', 'payroll_admin'])('%s with 2+ orchards sees the switcher', role => {
    as(role);
    render(<OrchardSwitcher />);
    expect(screen.getByText('North Block')).toBeDefined();
  });

  it.each(['team_leader', 'runner', 'qc_inspector', 'logistics'])('%s never sees it (cannot move itself)', role => {
    as(role);
    const { container } = render(<OrchardSwitcher />);
    expect(container.innerHTML).toBe('');
  });

  it('an office role with a single orchard does not see it either', () => {
    as('manager', orchards.slice(0, 1));
    const { container } = render(<OrchardSwitcher />);
    expect(container.innerHTML).toBe('');
  });
});
