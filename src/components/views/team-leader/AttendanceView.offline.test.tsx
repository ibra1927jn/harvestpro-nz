/**
 * Roll call sin cobertura: un fichaje que no sale se avisa, no se pierde en silencio.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const checkIn = vi.fn().mockRejectedValue(new Error('Failed to send a request to the Edge Function'));
const checkOut = vi.fn().mockRejectedValue(new Error('Failed to send a request to the Edge Function'));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'tl1', orchard_id: 'o1' } }) }));
vi.mock('@/hooks/useAttendance', () => ({
    useAttendance: () => ({
        loading: false,
        processing: null,
        mergedList: [
            { id: 'p1', name: 'Ana Present', isPresent: true, attendanceRecord: { id: 'att-1', check_in: '2026-10-13T07:00:00+13:00' } },
            { id: 'p2', name: 'Bea Absent', isPresent: false },
        ],
        stats: { present: 1, absent: 1, total: 2 },
        checkIn,
        checkOut,
    }),
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import AttendanceView from './AttendanceView';

describe('AttendanceView without signal', () => {
    it('a check-out that fails is shown to the team leader', async () => {
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: /Check Out/i }));
        expect(await screen.findByText(/Failed to send a request/)).toBeInTheDocument();
        expect(checkOut).toHaveBeenCalledWith('att-1');
    });

    it('a check-in that fails is shown to the team leader', async () => {
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: /Check In/i }));
        expect(await screen.findByText(/Failed to send a request/)).toBeInTheDocument();
    });
});
