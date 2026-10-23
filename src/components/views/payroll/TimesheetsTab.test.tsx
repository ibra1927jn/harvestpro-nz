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

  it('Reject asks for a reason, sends it to the server and moves the row to Rejected', async () => {
    invoke.mockResolvedValue({ data: { success: true, attendance_id: 'att-1', updated_at: '2026-10-14T04:00:00Z' }, error: null });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('2 Pending');

    fireEvent.click(within(pendingCard('Aroha')).getByRole('button', { name: /Reject/ }));
    // Sin motivo (o con menos de 3 caracteres) no se puede rechazar
    const confirm = within(pendingCard('Aroha')).getByRole('button', { name: 'Reject' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for rejection'), { target: { value: 'no' } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason for rejection'), { target: { value: '  Break time missing  ' } });
    fireEvent.click(confirm);

    await screen.findByText('Timesheet rejected for Aroha');
    expect(invoke).toHaveBeenCalledWith('approve-timesheet', {
      attendance_id: 'att-1',
      decision: 'reject',
      current_updated_at: '2026-10-14T03:00:00.000Z',
      reason: 'Break time missing',
    });
    expect(screen.getByText('Break time missing')).toBeDefined();
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
    fireEvent.change(screen.getByLabelText('Reason for rejection'), { target: { value: 'Wrong hours' } });
    fireEvent.click(within(pendingCard('Aroha')).getByRole('button', { name: 'Reject' }));

    await screen.findByText("This pay week is closed. Reopen it to change Aroha's timesheet");
    await waitFor(() => expect(screen.getByText('2 Pending')).toBeDefined());
  });

  it('an open shift (no check-out) cannot be approved and says why; Approve all skips it and says so', async () => {
    vi.spyOn(payrollService, 'fetchTimesheets').mockResolvedValue([
      entry({ id: 'att-1', picker_name: 'Aroha' }),
      entry({ id: 'att-2', picker_name: 'Mere' }),
      entry({ id: 'att-4', picker_name: 'Open Ana', check_out: null }),
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    invoke.mockResolvedValue({
      data: { success: true, approved: 2, results: [
        { attendance_id: 'att-1', status: 'approved', updated_at: 'x' },
        { attendance_id: 'att-2', status: 'approved', updated_at: 'y' },
      ] },
      error: null,
    });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('3 Pending');

    const approveOpen = within(pendingCard('Open Ana')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(approveOpen.disabled).toBe(true);
    expect(within(pendingCard('Open Ana')).getByText(/Open shift \(no check-out yet\)/)).toBeDefined();
    expect(screen.getByText('1 skipped (open, or over 14 h and not corrected)')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Approve all (2)' }));
    await screen.findByText('Approved 2 timesheets · 1 skipped (open, or over 14 h and not corrected)');
    expect(confirmSpy.mock.calls[0][0]).toContain('1 skipped (open');
    const [, body] = invoke.mock.calls[0];
    expect(body.items.map((i: { attendance_id: string }) => i.attendance_id)).toEqual(['att-1', 'att-2']);
    confirmSpy.mockRestore();
  });

  it('a shift over 14 h not corrected cannot be approved, says why and Approve all skips it', async () => {
    vi.spyOn(payrollService, 'fetchTimesheets').mockResolvedValue([
      entry({ id: 'att-1', picker_name: 'Aroha' }),
      entry({ id: 'att-2', picker_name: 'Mere' }),
      entry({ id: 'att-5', picker_name: 'Long Tui', long_shift: true, requires_review: true }),
    ]);
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('3 Pending');
    const approveLong = within(pendingCard('Long Tui')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(approveLong.disabled).toBe(true);
    expect(within(pendingCard('Long Tui')).getByTestId('ts-long-shift').textContent).toContain('only 14 h are paid');
    expect(screen.getByRole('button', { name: 'Approve all (2)' })).toBeDefined();
  });

  it('error toasts show an error icon (not the success tick)', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<TimesheetsTab orchardId="o1" />);
    await screen.findByText('2 Pending');
    fireEvent.click(within(pendingCard('Mere')).getByRole('button', { name: /Approve/ }));
    const msg = await screen.findByText('Failed to approve timesheet for Mere');
    expect(msg.parentElement?.textContent).toContain('error');
    expect(msg.parentElement?.textContent).not.toContain('check_circle');
  });
});
