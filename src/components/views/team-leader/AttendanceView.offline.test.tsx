/**
 * Roll call sin cobertura: un fichaje que no sale se avisa, no se pierde en silencio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const checkIn = vi.fn();
const checkOut = vi.fn().mockRejectedValue(new Error('DAY_CLOSED: this day is closed.'));
const endBreak = vi.fn().mockResolvedValue({ state: 'queued', attendanceId: 'att-1' });
const hook = vi.hoisted(() => ({ queuedCount: 0, clockSkewMinutes: 0 }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'tl1', orchard_id: 'o1' } }) }));
vi.mock('@/hooks/useAttendance', () => ({
    useAttendance: () => ({
        loading: false,
        processing: null,
        mergedList: [
            {
                id: 'p1', name: 'Ana Present', isPresent: true, onBreak: true, pending: true,
                attendanceRecord: { id: 'att-1', check_in: '2026-10-13T07:00:00+13:00', break_start: '2026-10-13T10:00:00+13:00', break_end: null },
            },
            { id: 'p2', name: 'Bea Absent', isPresent: false },
        ],
        stats: { present: 1, absent: 1, total: 2 },
        checkIn,
        checkOut,
        startBreak: vi.fn(),
        endBreak,
        queuedCount: hook.queuedCount,
        clockSkewMinutes: hook.clockSkewMinutes,
    }),
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import AttendanceView from './AttendanceView';

afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('AttendanceView without signal', () => {
    it('a check-in without signal is saved on the phone and says so', async () => {
        checkIn.mockResolvedValueOnce({ state: 'queued', attendanceId: 'local-1' });
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: /Check In/i }));
        expect(await screen.findByText('Bea Absent: check-in saved on this phone. It will be sent when there is signal.')).toBeInTheDocument();
    });

    it('shows who is waiting for signal and who is on break', () => {
        hook.queuedCount = 2;
        render(<AttendanceView />);
        expect(screen.getByTestId('pending-p1')).toHaveTextContent('Waiting for signal');
        expect(screen.getByTestId('on-break-p1')).toBeInTheDocument();
        expect(screen.getByTestId('rollcall-queued')).toHaveTextContent('2 change(s) waiting for signal');
        hook.queuedCount = 0;
    });

    it('ending a break without signal is queued', async () => {
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: 'End break for Ana Present' }));
        expect(await screen.findByText('Ana Present: break saved on this phone. It will be sent when there is signal.')).toBeInTheDocument();
        expect(endBreak).toHaveBeenCalledWith('att-1');
    });

    it('a server refusal (closed day) is shown to the team leader', async () => {
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: /Check Out/i }));
        expect(await screen.findByText(/DAY_CLOSED/)).toBeInTheDocument();
        expect(checkOut).toHaveBeenCalledWith('att-1');
    });

    it('warns when the phone clock is off', () => {
        hook.clockSkewMinutes = -7;
        render(<AttendanceView />);
        expect(screen.getByTestId('clock-skew')).toHaveTextContent('7 min ahead');
        hook.clockSkewMinutes = 0;
    });
});
