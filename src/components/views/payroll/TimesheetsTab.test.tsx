/**
 * Pantalla de Nómina → fichajes: Aprobar y Rechazar (decisión del dueño:
 * payroll_admin aprueba y rechaza). Se simula solo la llamada a la Edge
 * Function; el servicio de nómina es el real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/repositories/edge-functions.repository', () => ({
  edgeFunctionsRepository: { invoke },
}));
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { payrollService } from '@/services/payroll.service';
import type { TimesheetEntry } from '@/services/payroll.service';
import { TimesheetsTab } from './TimesheetsTab';

function entry(over: Partial<TimesheetEntry>): TimesheetEntry {
  return {
    id: 'att-1',
    picker_id: 'p1',
    picker_name: 'Aroha',
    date: '2026-10-14',
    check_in: '2026-10-13T19:00:00Z',
    check_out: '2026-10-14T03:00:00Z',
    hours_worked: 7.5,
    verified_by: null,
    is_verified: false,
    orchard_id: 'o1',
    updated_at: '2026-10-14T03:00:00.000Z',
    ...over,
  };
}

function pendingCard(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Pending Approval' });
  const section = heading.closest('div.rounded-3xl') as HTMLElement;
  return within(section).getByText(name).closest('div.group') as HTMLElement;
}

describe('TimesheetsTab (Payroll screen)', () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.spyOn(payrollService, 'fetchTimesheets').mockResolvedValue([
      entry({ id: 'att-1', picker_name: 'Aroha' }),
      entry({ id: 'att-2', picker_name: 'Mere' }),
      // Rechazada antes: no está pendiente, sale en "Rejected" con su motivo
      entry({ id: 'att-3', picker_name: 'Tama', is_rejected: true, rejection_reason: 'Check-out missing' }),
    ]);
  });

  it('lists only unreviewed timesheets as pending; rejected ones apart with the reason', async () => {
    render(<TimesheetsTab orchardId="o1" />);
    expect(await screen.findByText('2 Pending')).toBeDefined();
    expect(within(pendingCard('Aroha')).getByRole('button', { name: /Approve/ })).toBeDefined();
    expect(screen.getByText('Check-out missing')).toBeDefined();
    expect(screen.getByRole('heading', { name: /Rejected/ }).textContent).toContain('(1)');
  });

  it('Reject asks the server (approve-timesheet, decision reject) and moves the row to Rejected', async () => {
    invoke.mockResolvedValue({ data: { success: true, attendance_id: 'att-1', updated_at: '2026-10-14T04:00:00Z' }, error: null });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('2 Pending');

    fireEvent.click(within(pendingCard('Aroha')).getByRole('button', { name: /Reject/ }));

    await screen.findByText('Timesheet rejected for Aroha');
    expect(invoke).toHaveBeenCalledWith('approve-timesheet', {
      attendance_id: 'att-1',
      decision: 'reject',
      current_updated_at: '2026-10-14T03:00:00.000Z',
    });
    expect(screen.getByText('1 Pending')).toBeDefined();
    expect(screen.getByRole('heading', { name: /Rejected/ }).textContent).toContain('(2)');
  });

  it('Approve asks the server and moves the row to Approved', async () => {
    invoke.mockResolvedValue({ data: { success: true, attendance_id: 'att-2', updated_at: '2026-10-14T04:00:00Z' }, error: null });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('2 Pending');

    fireEvent.click(within(pendingCard('Mere')).getByRole('button', { name: /Approve/ }));

    await screen.findByText('Timesheet approved for Mere');
    const [fn, body] = invoke.mock.calls[0];
    expect(fn).toBe('approve-timesheet');
    expect(body).toMatchObject({ attendance_id: 'att-2', current_updated_at: '2026-10-14T03:00:00.000Z' });
    expect(body).not.toHaveProperty('decision', 'reject');
    expect(screen.getByText('1 Pending')).toBeDefined();
    expect(screen.getByRole('heading', { name: /Approved/ }).textContent).toContain('(1)');
  });

  it('a closed pay week says so and leaves the timesheet pending', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'PAY_WEEK_CLOSED: the pay week of this timesheet is closed.' } });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('2 Pending');

    fireEvent.click(within(pendingCard('Aroha')).getByRole('button', { name: /Reject/ }));

    await screen.findByText("This pay week is closed. Reopen it to change Aroha's timesheet");
    await waitFor(() => expect(screen.getByText('2 Pending')).toBeDefined());
  });
});
