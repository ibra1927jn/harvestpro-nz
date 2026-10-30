/**
 * TimesheetEditor — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockGetAttendanceByDate = vi.fn();
const mockCorrectAttendance = vi.fn();
const mockCorrectAttendanceBatch = vi.fn();
const mockShowToast = vi.fn();
const network = vi.hoisted(() => ({ isOnline: true }));

vi.mock('@/services/attendance.service', () => ({
    attendanceService: {
        getAttendanceByDate: (...args: unknown[]) => mockGetAttendanceByDate(...args),
        correctAttendance: (...args: unknown[]) => mockCorrectAttendance(...args),
        correctAttendanceBatch: (...args: unknown[]) => mockCorrectAttendanceBatch(...args),
    },
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: network.isOnline, lastOnline: null, wasOffline: false, clearWasOffline: vi.fn() }),
}));

vi.mock('@/utils/nzst', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-03-10',
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: { id: 'admin1', name: 'Admin User', role: 'manager' },
    }),
}));

vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({
        toast: null,
        showToast: (...args: unknown[]) => mockShowToast(...args),
        hideToast: vi.fn(),
    }),
}));

vi.mock('@/components/ui/Toast', () => ({
    default: () => null,
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import TimesheetEditor from './TimesheetEditor';

describe('TimesheetEditor', () => {
    const mockRecords = [
        {
            id: 'att1',
            date: '2026-03-10',
            picker_id: 'p-alice',
            picker: { name: 'Alice Smith', picker_id: 'PK-001' },
            check_in: '2026-03-10T07:00:00+13:00',
            check_out: '2026-03-10T15:00:00+13:00',
            status: 'completed',
            corrected_at: null,
        },
        {
            id: 'att2',
            date: '2026-03-10',
            picker_id: 'p-bob',
            picker: { name: 'Bob Jones', picker_id: 'PK-002' },
            check_in: '2026-03-10T06:00:00+13:00',
            check_out: null,
            status: 'active',
            corrected_at: null,
        },
        {
            id: 'att3',
            date: '2026-03-10',
            picker_id: 'p-charlie',
            picker: { name: 'Charlie', picker_id: 'PK-003' },
            check_in: '2026-03-10T04:00:00+13:00',
            check_out: '2026-03-10T20:00:00+13:00',
            status: 'completed',
            corrected_at: '2026-03-09T18:00:00+13:00',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        network.isOnline = true;
        mockGetAttendanceByDate.mockResolvedValue(mockRecords);
        mockCorrectAttendance.mockResolvedValue(undefined);
        mockCorrectAttendanceBatch.mockImplementation(async (items: { attendance_id: string }[]) => ({
            success: true, total: items.length, succeeded: items.length, failed: 0,
            results: items.map((it, index) => ({ index, attendance_id: it.attendance_id, success: true })),
        }));
    });

    it('renders Timesheet Editor heading', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        expect(screen.getByText('Timesheet Editor')).toBeTruthy();
    });

    it('renders subtitle', () => {
        render(<TimesheetEditor orchardId="o1" />);
        expect(screen.getByText('Correct attendance records with audit trail')).toBeTruthy();
    });

    it('renders date picker', () => {
        render(<TimesheetEditor orchardId="o1" />);
        expect(screen.getByTitle('Select date')).toBeTruthy();
    });

    it('renders audit compliance info box', () => {
        render(<TimesheetEditor orchardId="o1" />);
        expect(screen.getByText('Audit Compliance')).toBeTruthy();
    });

    it('loads attendance records on mount', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(mockGetAttendanceByDate).toHaveBeenCalledWith('o1', '2026-03-10'));
    });

    it('renders picker names in the table', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
        expect(screen.getByText('Bob Jones')).toBeTruthy();
    });

    it('renders table headers', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(screen.getByText('Picker')).toBeTruthy());
        expect(screen.getByText('Check-In')).toBeTruthy();
        expect(screen.getByText('Check-Out')).toBeTruthy();
        expect(screen.getByText('Hours')).toBeTruthy();
        expect(screen.getByText('Status')).toBeTruthy();
        expect(screen.getByText('Action')).toBeTruthy();
    });

    it('shows "Corrected" badge for corrected records', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(screen.getByText('Corrected')).toBeTruthy());
    });

    it('shows edit button for each record', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => {
            const editButtons = screen.getAllByLabelText(/Edit .* timesheet/);
            expect(editButtons.length).toBe(3);
        });
    });

    it('enters edit mode when edit button is clicked', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        const editBtn = screen.getByLabelText("Edit Alice Smith's timesheet");
        fireEvent.click(editBtn);
        expect(screen.getByTitle('Check-in time')).toBeTruthy();
        expect(screen.getByTitle('Check-out time')).toBeTruthy();
        expect(screen.getByPlaceholderText('Reason for correction *')).toBeTruthy();
    });

    it('shows cancel and save buttons in edit mode', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        expect(screen.getByLabelText('Cancel edit')).toBeTruthy();
        expect(screen.getByLabelText('Save correction')).toBeTruthy();
    });

    it('cancels edit when cancel is clicked', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        fireEvent.click(screen.getByLabelText('Cancel edit'));
        expect(screen.queryByTitle('Check-in time')).toBeNull();
    });

    it('requires reason for correction to save', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        // Save button should be disabled when reason is empty
        const saveBtn = screen.getByLabelText('Save correction');
        expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('save button is disabled when reason is empty', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        const saveBtn = screen.getByLabelText('Save correction');
        expect(saveBtn).toHaveProperty('disabled', true);
    });

    it('saves correction when reason is provided', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        // Enter time and reason
        fireEvent.change(screen.getByTitle('Check-in time'), { target: { value: '07:30' } });
        fireEvent.change(screen.getByPlaceholderText('Reason for correction *'), { target: { value: 'Wrong clock-in' } });
        fireEvent.click(screen.getByLabelText('Save correction'));
        await waitFor(() => expect(mockCorrectAttendance).toHaveBeenCalled());
    });

    it('saves times as UTC with the real NZ offset and the break time', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
        fireEvent.change(screen.getByTitle('Check-in time'), { target: { value: '07:30' } });
        fireEvent.change(screen.getByTitle('Break start time'), { target: { value: '12:00' } });
        fireEvent.change(screen.getByPlaceholderText('Reason for correction *'), { target: { value: 'Break recorded' } });
        fireEvent.click(screen.getByLabelText('Save correction'));
        await waitFor(() => expect(mockCorrectAttendance).toHaveBeenCalled());
        const [id, updates] = mockCorrectAttendance.mock.calls.at(-1)!;
        expect(id).toBe('att1');
        // 2026-03-10 es horario de verano NZ (+13): 07:30 NZ = 18:30 UTC del día anterior
        expect(updates.check_in).toBe('2026-03-09T18:30:00.000Z');
        expect(updates.break_start).toBe('2026-03-09T23:00:00.000Z');
    });

    it('shows paid hours (break deducted) and flags shifts not closed on past days', async () => {
        mockGetAttendanceByDate.mockResolvedValueOnce([
            { ...mockRecords[0] },
            { id: 'old', date: '2026-03-09', picker: { name: 'Old Open', picker_id: 'PK-9' }, check_in: '2026-03-09T07:00:00+13:00', check_out: null, status: 'active', corrected_at: null },
        ]);
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        expect(screen.getByText('8h')).toBeTruthy(); // 07:00–15:00, sin descanso anotado: no se descuenta
        expect(screen.getByText('Not closed')).toBeTruthy();
    });

    it('warns about meal breaks not recorded on shifts over 4 h (they are not deducted)', async () => {
        mockGetAttendanceByDate.mockResolvedValueOnce([
            { ...mockRecords[0] },
            { ...mockRecords[0], id: 'with-break', picker: { name: 'Bea', picker_id: 'PK-7' }, break_start: '2026-03-10T11:00:00+13:00' },
            { id: 'short', date: '2026-03-10', picker: { name: 'Short', picker_id: 'PK-8' }, check_in: '2026-03-10T07:00:00+13:00', check_out: '2026-03-10T10:00:00+13:00', status: 'completed', corrected_at: null },
        ]);
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        // Solo Alice: Bea lo tiene anotado (7.5 h) y el turno corto no lo necesita
        expect(screen.getAllByText('Not recorded')).toHaveLength(1);
        expect(screen.getByText('7.5h')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('Meal break not recorded on 1 shift(s) over 4 h');
    });

    it('shows empty state when no records for date', async () => {
        mockGetAttendanceByDate.mockResolvedValue([]);
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(screen.getByText(/No attendance records for/)).toBeTruthy());
    });

    it('does not load records when orchardId is empty', () => {
        render(<TimesheetEditor orchardId="" />);
        expect(mockGetAttendanceByDate).not.toHaveBeenCalled();
    });

    it('shows picker ID in the table', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => expect(screen.getByText('PK-001')).toBeTruthy());
    });

    // Auditoría 23-10 (C): el TL y el manager ven lo que decidió Nómina
    it('shows the payroll review of each timesheet (approved / rejected with reason)', async () => {
        mockGetAttendanceByDate.mockResolvedValueOnce([
            { ...mockRecords[0], verified_by: 'pay-1', verified_at: '2026-03-11T09:00:00+13:00' },
            { ...mockRecords[1], rejected_at: '2026-03-11T09:00:00+13:00', rejection_reason: 'Break time missing' },
            { ...mockRecords[2], rejected_at: '2026-03-11T09:00:00+13:00', rejection_reason: null },
        ]);
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        expect(screen.getAllByText('Approved by payroll')).toHaveLength(1);
        expect(screen.getByText('Rejected: Break time missing')).toBeTruthy();
        expect(screen.getByText('Rejected by payroll')).toBeTruthy();
    });

    it('shows no review badge on timesheets nobody reviewed yet', async () => {
        render(<TimesheetEditor orchardId="o1" />);
        await waitFor(() => screen.getByText('Alice Smith'));
        expect(screen.queryByText('Approved by payroll')).toBeNull();
        expect(screen.queryByText(/^Rejected/)).toBeNull();
    });

    // ── #9: alcance por pickerIds (team leader) ──────────────────────
    describe('pickerIds scope (team leader)', () => {
        it("shows only the given pickers' timesheets and says so", async () => {
            render(<TimesheetEditor orchardId="o1" pickerIds={['p-alice', 'p-charlie']} />);
            await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
            expect(screen.getByText('Charlie')).toBeTruthy();
            expect(screen.queryByText('Bob Jones')).toBeNull();
            expect(screen.getByText("Showing your team's timesheets only.")).toBeTruthy();
        });

        it('shows the empty state for a team leader without a team (empty list)', async () => {
            render(<TimesheetEditor orchardId="o1" pickerIds={[]} />);
            await waitFor(() => expect(mockGetAttendanceByDate).toHaveBeenCalled());
            await waitFor(() => expect(screen.getByText(/No attendance records for/)).toBeTruthy());
            expect(screen.queryByText('Alice Smith')).toBeNull();
        });

        it('without pickerIds (manager) shows the whole orchard', async () => {
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => expect(screen.getByText('Bob Jones')).toBeTruthy());
            expect(screen.queryByText("Showing your team's timesheets only.")).toBeNull();
        });
    });

    // ── #9: selección múltiple y corrección en lote ───────────────────
    describe('batch correction', () => {
        const selectOf = (name: string) => screen.getByLabelText(`Select ${name}'s timesheet`);

        it('shows the batch panel only when something is selected, with the count', async () => {
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            expect(screen.queryByRole('region', { name: /Correct \d+ timesheets/ })).toBeNull();
            fireEvent.click(selectOf('Alice Smith'));
            expect(screen.getByRole('region', { name: 'Correct 1 timesheets' })).toBeTruthy();
            fireEvent.click(selectOf('Bob Jones'));
            expect(screen.getByRole('region', { name: 'Correct 2 timesheets' })).toBeTruthy();
            expect(screen.getByText('2 selected')).toBeTruthy();
            // Deseleccionar
            fireEvent.click(selectOf('Alice Smith'));
            expect(screen.getByRole('region', { name: 'Correct 1 timesheets' })).toBeTruthy();
        });

        it('"Select all" selects every row and "Select flagged" only those without check-out or meal break', async () => {
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(screen.getByLabelText('Select all timesheets'));
            expect(screen.getByRole('region', { name: 'Correct 3 timesheets' })).toBeTruthy();
            // Alice (8 h sin descanso) y Charlie (16 h sin descanso) tienen aviso; Bob (sin salida) también
            fireEvent.click(screen.getByRole('button', { name: 'Select flagged (3)' }));
            expect(screen.getByRole('region', { name: 'Correct 3 timesheets' })).toBeTruthy();
            fireEvent.click(screen.getByText('Clear selection'));
            expect(screen.queryByRole('region', { name: /Correct/ })).toBeNull();
        });

        it('"Select flagged" leaves out complete timesheets', async () => {
            mockGetAttendanceByDate.mockResolvedValueOnce([
                { ...mockRecords[0], break_start: '2026-03-10T11:00:00+13:00' }, // completo
                mockRecords[1], // sin salida
            ]);
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(screen.getByRole('button', { name: 'Select flagged (1)' }));
            expect(screen.getByRole('region', { name: 'Correct 1 timesheets' })).toBeTruthy();
            expect((selectOf('Bob Jones') as HTMLInputElement).checked).toBe(true);
            expect((selectOf('Alice Smith') as HTMLInputElement).checked).toBe(false);
        });

        it('applies the same correction to all selected rows with one reason (empty fields untouched)', async () => {
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(selectOf('Alice Smith'));
            fireEvent.click(selectOf('Bob Jones'));
            const panel = screen.getByRole('region', { name: 'Correct 2 timesheets' });
            const apply = screen.getByRole('button', { name: 'Apply to 2' });
            // Sin cambios ni motivo no se puede aplicar
            expect(apply).toHaveProperty('disabled', true);
            fireEvent.change(within(panel).getByLabelText('Check-Out'), { target: { value: '16:30' } });
            expect(apply).toHaveProperty('disabled', true);
            fireEvent.change(screen.getByPlaceholderText('Reason for all corrections *'), { target: { value: 'Everyone left at 16:30' } });
            expect(apply).toHaveProperty('disabled', false);
            fireEvent.click(apply);
            await waitFor(() => expect(mockCorrectAttendanceBatch).toHaveBeenCalledTimes(1));
            const [items, reason, adminId] = mockCorrectAttendanceBatch.mock.calls[0];
            expect(reason).toBe('Everyone left at 16:30');
            expect(adminId).toBe('admin1');
            // 2026-03-10 es horario de verano NZ (+13): 16:30 NZ = 03:30 UTC
            expect(items).toEqual([
                { attendance_id: 'att1', check_out: '2026-03-10T03:30:00.000Z' },
                { attendance_id: 'att2', check_out: '2026-03-10T03:30:00.000Z' },
            ]);
            // Éxito: aviso, selección limpia y recarga
            await waitFor(() => expect(screen.getByText('Corrected 2 timesheets')).toBeTruthy());
            expect(screen.queryByRole('region', { name: /Correct/ })).toBeNull();
            expect(mockGetAttendanceByDate).toHaveBeenCalledTimes(2);
        });

        it('keeps the failed rows selected and warns when part of the batch fails', async () => {
            mockCorrectAttendanceBatch.mockResolvedValueOnce({
                success: false, total: 2, succeeded: 1, failed: 1,
                results: [
                    { index: 0, attendance_id: 'att1', success: true },
                    { index: 1, attendance_id: 'att2', success: false, error: 'Not allowed to correct this timesheet' },
                ],
            });
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(screen.getByLabelText('Select all timesheets'));
            fireEvent.click(selectOf('Charlie'));
            const panel = screen.getByRole('region', { name: 'Correct 2 timesheets' });
            fireEvent.change(within(panel).getByLabelText('Break'), { target: { value: '12:00' } });
            fireEvent.change(screen.getByPlaceholderText('Reason for all corrections *'), { target: { value: 'Break not recorded' } });
            fireEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('1 corrected, 1 failed (still selected)', 'warning'));
            await waitFor(() => expect(screen.getByRole('region', { name: 'Correct 1 timesheets' })).toBeTruthy());
            expect((selectOf('Bob Jones') as HTMLInputElement).checked).toBe(true);
            expect((selectOf('Alice Smith') as HTMLInputElement).checked).toBe(false);
        });

        it('disables the batch button offline and explains that batches are not queued', async () => {
            network.isOnline = false;
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(selectOf('Alice Smith'));
            const panel = screen.getByRole('region', { name: 'Correct 1 timesheets' });
            fireEvent.change(within(panel).getByLabelText('Check-In'), { target: { value: '07:30' } });
            fireEvent.change(screen.getByPlaceholderText('Reason for all corrections *'), { target: { value: 'Late clock-in fixed' } });
            expect(screen.getByRole('button', { name: 'Apply to 1' })).toHaveProperty('disabled', true);
            expect(within(panel).getByRole('status').textContent).toContain('not queued');
            expect(mockCorrectAttendanceBatch).not.toHaveBeenCalled();
        });

        it('single-row editing still works alongside the selection', async () => {
            render(<TimesheetEditor orchardId="o1" />);
            await waitFor(() => screen.getByText('Alice Smith'));
            fireEvent.click(selectOf('Bob Jones'));
            fireEvent.click(screen.getByLabelText("Edit Alice Smith's timesheet"));
            fireEvent.change(screen.getByTitle('Check-in time'), { target: { value: '07:30' } });
            fireEvent.change(screen.getByPlaceholderText('Reason for correction *'), { target: { value: 'Wrong clock-in' } });
            fireEvent.click(screen.getByLabelText('Save correction'));
            await waitFor(() => expect(mockCorrectAttendance).toHaveBeenCalledTimes(1));
            expect(mockCorrectAttendanceBatch).not.toHaveBeenCalled();
        });
    });
});
