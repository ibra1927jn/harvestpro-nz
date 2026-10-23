/**
 * Nómina → fichajes: quien tiene una ausencia aprobada hoy sale marcado
 * (el pago de la ausencia lo hace el programa de nóminas).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/repositories/edge-functions.repository', () => ({ edgeFunctionsRepository: { invoke: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('@/hooks/useLeave', () => ({
  useLeaveOnDay: () => new Map([
    ['p1', { picker_id: 'p1', type: 'sick', half_day: true }],
    ['p9', { picker_id: 'p9', type: 'annual', half_day: false }],
  ]),
}));

import { payrollService } from '@/services/payroll.service';
import { TimesheetsTab } from './TimesheetsTab';
import { useHarvestStore } from '@/stores/useHarvestStore';

describe('TimesheetsTab — leave', () => {
  it('marks the timesheet of someone on leave and lists who is on leave today', async () => {
    useHarvestStore.setState({ crew: [{ id: 'p9', name: 'Rua Hall' }] as never });
    vi.spyOn(payrollService, 'fetchTimesheets').mockResolvedValue([{
      id: 'att-1', picker_id: 'p1', picker_name: 'Aroha', date: '2026-10-23', check_in: '2026-10-22T19:00:00Z',
      check_out: '2026-10-22T23:00:00Z', hours_worked: 4, verified_by: null, is_verified: false, orchard_id: 'o1',
      updated_at: '2026-10-22T23:00:00Z',
    }]);
    render(<TimesheetsTab orchardId="o1" />);
    expect((await screen.findByTestId('ts-on-leave-p1')).textContent).toBe('On leave (Sick leave)');
    const banner = screen.getByTestId('ts-on-leave-today');
    expect(banner.textContent).toContain('On approved leave today: 2');
    expect(banner.textContent).toContain('Rua Hall (Annual leave)');
    expect(banner.textContent).toMatch(/Aroha \(Sick leave · Half day\)/);
  });
});
