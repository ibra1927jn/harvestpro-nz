/**
 * MyTimesheetView — «Mi hoja»: solo los tramos propios y «pedir corrección».
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'u1', orchard_id: 'o1', full_name: 'Rata Runner' } }),
}));

const svc = vi.hoisted(() => ({
    fetchMyShifts: vi.fn(),
    requestCorrection: vi.fn(),
}));
vi.mock('@/services/my-timesheet.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/my-timesheet.service')>()),
    myTimesheetService: svc,
}));

import MyTimesheetView from './MyTimesheetView';

const shifts = [
    { id: 's1', date: '2026-10-12', orchardId: 'o1', checkIn: '2026-10-12T07:00:00+13:00', checkOut: '2026-10-12T15:30:00+13:00', breakStart: null, breakMinutes: 30, hours: 8, status: 'approved' as const, correctedAt: null, correctionReason: null },
    { id: 's2', date: '2026-10-13', orchardId: 'o1', checkIn: '2026-10-13T07:00:00+13:00', checkOut: null, breakStart: null, breakMinutes: null, hours: 2.5, status: 'open' as const, correctedAt: null, correctionReason: null },
];

describe('MyTimesheetView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        svc.fetchMyShifts.mockResolvedValue(shifts);
        svc.requestCorrection.mockResolvedValue(1);
    });

    it('pide solo los tramos del usuario de la semana de pago y los enseña con estado y horas', async () => {
        render(<MyTimesheetView />);
        await waitFor(() => expect(screen.getAllByTestId('my-shift')).toHaveLength(2));
        const [userId, start, end] = svc.fetchMyShifts.mock.calls[0];
        expect(userId).toBe('u1');
        expect(start < end).toBe(true);
        expect(screen.getByText('Approved')).toBeTruthy();
        expect(screen.getByText('Clocked in')).toBeTruthy();
        expect(screen.getByText('8 h')).toBeTruthy();
        expect(screen.getByText('10.5')).toBeTruthy();  // horas de la semana
        expect(screen.queryByText(/Edit/)).toBeNull();     // no hay edición directa
    });

    it('«pedir corrección» manda el mensaje al manager con lo registrado y lo propuesto', async () => {
        render(<MyTimesheetView />);
        await waitFor(() => expect(screen.getAllByTestId('my-shift')).toHaveLength(2));
        fireEvent.click(screen.getAllByText('Ask for a correction')[0]);
        const reason = screen.getByPlaceholderText(/clocked out at 15:30/);
        fireEvent.change(reason, { target: { value: 'I left at 15:00' } });
        fireEvent.click(screen.getByText('Send to manager'));
        await waitFor(() => expect(svc.requestCorrection).toHaveBeenCalledTimes(1));
        const arg = svc.requestCorrection.mock.calls[0][0];
        expect(arg).toMatchObject({ userId: 'u1', orchardId: 'o1' });
        expect(arg.content).toContain('Timesheet correction request');
        expect(arg.content).toContain('Reason: I left at 15:00');
        expect(arg.content).toContain('Shift ref: s1');
        await waitFor(() => expect(screen.getByText('Request sent to the manager')).toBeTruthy());
    });

    it('semana anterior: vuelve a pedir los tramos con otras fechas', async () => {
        render(<MyTimesheetView />);
        await waitFor(() => expect(svc.fetchMyShifts).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByLabelText('Previous week'));
        await waitFor(() => expect(svc.fetchMyShifts).toHaveBeenCalledTimes(2));
        const first = svc.fetchMyShifts.mock.calls[0][1];
        const second = svc.fetchMyShifts.mock.calls[1][1];
        expect(second < first).toBe(true);
    });
});
