/**
 * TimesheetEditor — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetAttendanceByDate = vi.fn();
const mockCorrectAttendance = vi.fn();
const mockShowToast = vi.fn();

vi.mock('@/services/attendance.service', () => ({
    attendanceService: {
        getAttendanceByDate: (...args: unknown[]) => mockGetAttendanceByDate(...args),
        correctAttendance: (...args: unknown[]) => mockCorrectAttendance(...args),
    },
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
            picker: { name: 'Alice Smith', picker_id: 'PK-001' },
            check_in: '2026-03-10T07:00:00+13:00',
            check_out: '2026-03-10T15:00:00+13:00',
            status: 'completed',
            corrected_at: null,
        },
        {
            id: 'att2',
            date: '2026-03-10',
            picker: { name: 'Bob Jones', picker_id: 'PK-002' },
            check_in: '2026-03-10T06:00:00+13:00',
            check_out: null,
            status: 'active',
            corrected_at: null,
        },
        {
            id: 'att3',
            date: '2026-03-10',
            picker: { name: 'Charlie', picker_id: 'PK-003' },
            check_in: '2026-03-10T04:00:00+13:00',
            check_out: '2026-03-10T20:00:00+13:00',
            status: 'completed',
            corrected_at: '2026-03-09T18:00:00+13:00',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAttendanceByDate.mockResolvedValue(mockRecords);
        mockCorrectAttendance.mockResolvedValue(undefined);
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
        expect(screen.getByText('7.5h')).toBeTruthy(); // 07:00–15:00 = 8 h − 30 min
        expect(screen.getByText('Not closed')).toBeTruthy();
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
});
