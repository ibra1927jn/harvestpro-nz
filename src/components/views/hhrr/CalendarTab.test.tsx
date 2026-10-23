/**
 * CalendarTab (Agenda) — mes con ausencias, festivos y vencimientos; semana;
 * nueva ausencia; aprobar / rechazar / cancelar. El antiguo «Horario de hoy»
 * (descansos calculados del fin de turno) ya no existe.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Employee } from '@/services/hhrr/hhrr.types';
import type { LeaveRequest } from '@/services/leave.service';

const mockListInRange = vi.fn();
const mockCreate = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockCancel = vi.fn();

vi.mock('@/services/leave.service', async importOriginal => ({
    ...(await importOriginal<typeof import('@/services/leave.service')>()),
    leaveService: {
        listInRange: (...a: unknown[]) => mockListInRange(...a),
        create: (...a: unknown[]) => mockCreate(...a),
        approve: (...a: unknown[]) => mockApprove(...a),
        reject: (...a: unknown[]) => mockReject(...a),
        cancel: (...a: unknown[]) => mockCancel(...a),
    },
}));

const auth = { appUser: { id: 'hr-1', role: 'hr_admin' } as { id: string; role: string } | null };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: { orchard: { id: string } }) => unknown) => selector({ orchard: { id: 'o-store' } }),
}));

vi.mock('@/utils/nzst', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-10-22',
}));

import CalendarTab from './CalendarTab';

const emp = (over: Partial<Employee>): Employee => ({
    id: 'p1', full_name: 'Aroha Smith', email: '', role: 'picker', status: 'active', contract_type: 'seasonal',
    contract_start: '2026-01-01', hourly_rate: 23.95, visa_status: 'not_recorded', hire_date: '2026-01-01',
    source: 'staff', orchard_id: 'o1', ...over,
});

const leave = (over: Partial<LeaveRequest>): LeaveRequest => ({
    id: 'l1', orchard_id: 'o1', picker_id: 'p1', type: 'annual', start_date: '2026-10-20', end_date: '2026-10-21',
    half_day: false, reason: null, status: 'requested', requested_by: 'hr-1', decided_by: null, decided_at: null,
    decision_note: null, created_at: '', updated_at: '', ...over,
});

const employees = [
    emp({ id: 'p1', full_name: 'Aroha Smith', visa_status: 'work_visa', visa_expiry: '2026-10-30' }),
    emp({ id: 'p2', full_name: 'Ben Kaur', contract_id: 'c2', contract_end: '2026-10-23' }),
    emp({ id: 'p3', full_name: 'Office Olga', source: 'office', role: 'hr_admin' }),
];

beforeEach(() => {
    vi.clearAllMocks();
    auth.appUser = { id: 'hr-1', role: 'hr_admin' };
    mockListInRange.mockResolvedValue([
        leave({ id: 'l1', picker_id: 'p1' }),
        leave({ id: 'l2', picker_id: 'p2', type: 'sick', status: 'approved', start_date: '2026-10-22', end_date: '2026-10-22', half_day: true }),
    ]);
});

describe('CalendarTab (Agenda)', () => {
    it('loads the leaves of the visible month and shows leaves, expiries and NZ holidays in the grid', async () => {
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalledWith('2026-09-28', '2026-11-01'));
        expect(screen.getByTestId('agenda-title').textContent).toBe('Oct 2026');
        await waitFor(() => expect(within(screen.getByTestId('agenda-day-2026-10-20')).getByText('Aroha Smith · Annual leave')).toBeTruthy());
        // Una ausencia de dos días sale los dos días
        expect(within(screen.getByTestId('agenda-day-2026-10-21')).getByText('Aroha Smith · Annual leave')).toBeTruthy();
        expect(within(screen.getByTestId('agenda-day-2026-10-22')).getByText('Ben Kaur · Sick leave')).toBeTruthy();
        expect(within(screen.getByTestId('agenda-day-2026-10-30')).getByText('Visa expires: Aroha Smith')).toBeTruthy();
        expect(within(screen.getByTestId('agenda-day-2026-10-23')).getByText('Contract ends: Ben Kaur')).toBeTruthy();
        // Labour Day 2026-10-26: festivo marcado en la celda
        expect(screen.getByTestId('agenda-day-2026-10-26').className).toContain('bg-violet-50');
        // Lo viejo ya no está
        expect(screen.queryByText("Today's Schedule")).toBeNull();
        expect(screen.queryByText('17:00')).toBeNull();
        expect(screen.getByTestId('breaks-reminder').textContent).toMatch(/10-min rest every 2 h.*30-min meal break at 4 h/);
    });

    it('navigates months and jumps back to today', async () => {
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByLabelText('Next'));
        expect(screen.getByTestId('agenda-title').textContent).toBe('Nov 2026');
        await waitFor(() => expect(mockListInRange).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06'));
        fireEvent.click(screen.getByLabelText('Previous'));
        fireEvent.click(screen.getByLabelText('Previous'));
        expect(screen.getByTestId('agenda-title').textContent).toMatch(/^Sept? 2026$/);
        fireEvent.click(screen.getByText('Today'));
        expect(screen.getByTestId('agenda-title').textContent).toBe('Oct 2026');
    });

    it('week view lists each day with its leaves, status and the public holiday', async () => {
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('Week'));
        await waitFor(() => expect(mockListInRange).toHaveBeenLastCalledWith('2026-10-19', '2026-10-25'));
        expect(screen.getByTestId('agenda-week')).toBeTruthy();
        const tue = screen.getByTestId('agenda-week-day-2026-10-20');
        expect(within(tue).getByText('Aroha Smith · Annual leave')).toBeTruthy();
        expect(within(tue).getByText('Requested')).toBeTruthy();
        const thu = screen.getByTestId('agenda-week-day-2026-10-22');
        expect(within(thu).getByText('Ben Kaur · Sick leave')).toBeTruthy();
        expect(within(thu).getByText('Approved')).toBeTruthy();
        expect(within(thu).getByText('Half day')).toBeTruthy();
        expect(within(screen.getByTestId('agenda-week-day-2026-10-19')).getByText('Nothing scheduled')).toBeTruthy();
        // Clicar un día del mes abre esa semana
        fireEvent.click(screen.getByText('Month'));
        fireEvent.click(screen.getByTestId('agenda-day-2026-10-26'));
        await waitFor(() => expect(within(screen.getByTestId('agenda-week-day-2026-10-26')).getByText('Public holiday')).toBeTruthy());
    });

    it('creates a leave from the modal (person search over staff, type, dates, half day, reason)', async () => {
        mockCreate.mockResolvedValue(leave({ id: 'new' }));
        const onChanged = vi.fn();
        render(<CalendarTab employees={employees} onChanged={onChanged} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('New leave'));
        const modal = screen.getByTestId('new-leave-modal');
        // Sin persona no se guarda
        fireEvent.click(within(modal).getByText('Save leave'));
        expect(within(modal).getByRole('alert').textContent).toBe('Choose a person');
        expect(mockCreate).not.toHaveBeenCalled();
        // El buscador solo ofrece plantilla (no cuentas de oficina)
        fireEvent.change(within(modal).getByPlaceholderText('Search by name…'), { target: { value: 'ol' } });
        expect(within(screen.getByTestId('person-results')).queryByText('Office Olga')).toBeNull();
        fireEvent.change(within(modal).getByPlaceholderText('Search by name…'), { target: { value: 'ben' } });
        fireEvent.click(within(screen.getByTestId('person-results')).getByText('Ben Kaur'));
        fireEvent.change(within(modal).getByRole('combobox'), { target: { value: 'sick' } });
        const dates = modal.querySelectorAll('input[type="date"]');
        fireEvent.change(dates[0], { target: { value: '2026-10-27' } });
        fireEvent.change(dates[1], { target: { value: '2026-10-28' } });
        fireEvent.change(within(modal).getByRole('textbox'), { target: { value: 'Flu' } });
        fireEvent.click(within(modal).getByText('Save leave'));
        await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
            orchardId: 'o1', pickerId: 'p2', type: 'sick', startDate: '2026-10-27', endDate: '2026-10-28',
            halfDay: false, reason: 'Flu', requestedBy: 'hr-1', status: 'requested',
        }));
        // Confirmación en un toast
        expect(await screen.findByText('Leave saved for Ben Kaur')).toBeTruthy();
        expect(onChanged).toHaveBeenCalled();
        expect(mockListInRange).toHaveBeenCalledTimes(2);
    });

    it('HR can register a leave as already approved; a half day collapses to a single day', async () => {
        mockCreate.mockResolvedValue(leave({ id: 'new' }));
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('New leave'));
        const modal = screen.getByTestId('new-leave-modal');
        fireEvent.click(within(screen.getByTestId('person-results')).getByText('Aroha Smith'));
        fireEvent.click(within(modal).getByLabelText('Half day'));
        fireEvent.click(within(modal).getByLabelText('Register as already approved'));
        fireEvent.click(within(modal).getByText('Save leave'));
        await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            pickerId: 'p1', startDate: '2026-10-22', endDate: '2026-10-22', halfDay: true, status: 'approved',
        })));
    });

    it('approves with a note, rejects, and cancels from the week list', async () => {
        mockApprove.mockResolvedValue(leave({ status: 'approved' }));
        mockReject.mockResolvedValue(leave({ status: 'rejected' }));
        mockCancel.mockResolvedValue(leave({ status: 'cancelled' }));
        const onChanged = vi.fn();
        render(<CalendarTab employees={employees} onChanged={onChanged} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('Week'));
        await waitFor(() => expect(screen.getByTestId('agenda-week')).toBeTruthy());

        const tue = screen.getByTestId('agenda-week-day-2026-10-20');
        fireEvent.click(within(tue).getByText('Approve'));
        fireEvent.change(within(tue).getByPlaceholderText('Note (optional)'), { target: { value: 'Enjoy' } });
        fireEvent.click(within(tue).getByText('Confirm'));
        await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('l1', 'hr-1', 'Enjoy'));
        expect(await screen.findByText('Leave approved')).toBeTruthy();
        expect(onChanged).toHaveBeenCalledTimes(1);

        // Los botones solo salen el primer día visible de la ausencia (no se repiten el miércoles)
        const wed = screen.getByTestId('agenda-week-day-2026-10-21');
        expect(within(wed).getByText('Aroha Smith · Annual leave')).toBeTruthy();
        expect(within(wed).queryByText('Approve')).toBeNull();

        fireEvent.click(within(tue).getByText('Reject'));
        fireEvent.click(within(tue).getByText('Confirm'));
        await waitFor(() => expect(mockReject).toHaveBeenCalledWith('l1', 'hr-1', ''));

        // La aprobada de Ben se puede cancelar directamente
        const thu = screen.getByTestId('agenda-week-day-2026-10-22');
        expect(within(thu).queryByText('Approve')).toBeNull();
        fireEvent.click(within(thu).getByText('Cancel leave'));
        await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('l2', 'hr-1', undefined));
    });

    it('shows the error and keeps the screen when the decision is refused (e.g. own leave)', async () => {
        mockApprove.mockRejectedValue(new Error('Leave request not found or not allowed'));
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('Week'));
        await waitFor(() => expect(screen.getByTestId('agenda-week')).toBeTruthy());
        const tue = screen.getByTestId('agenda-week-day-2026-10-20');
        fireEvent.click(within(tue).getByText('Approve'));
        fireEvent.click(within(tue).getByText('Confirm'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not allowed/));
    });

    it('a team leader sees the agenda but has no approve / reject buttons', async () => {
        auth.appUser = { id: 'tl-1', role: 'team_leader' };
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(mockListInRange).toHaveBeenCalled());
        fireEvent.click(screen.getByText('Week'));
        await waitFor(() => expect(screen.getByTestId('agenda-week')).toBeTruthy());
        expect(screen.queryByText('Approve')).toBeNull();
        expect(screen.queryByText('Cancel leave')).toBeNull();
        fireEvent.click(screen.getByText('New leave'));
        expect(screen.queryByLabelText('Register as already approved')).toBeNull();
    });

    it('says so when the agenda cannot be loaded', async () => {
        mockListInRange.mockRejectedValueOnce(new Error('relation does not exist'));
        render(<CalendarTab employees={employees} />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("Couldn't load the agenda"));
    });
});
