/**
 * Pase de lista y ausencias: quien tiene una ausencia aprobada hoy sale «De
 * permiso», no cuenta como ausente ni se le ofrece fichar; el team leader pide
 * ausencias para su equipo y ve en qué estado están.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    leaveToday: new Map<string, { picker_id: string; type: string }>(),
    myItems: [] as unknown[],
    refetch: vi.fn(),
    requestOfflineFirst: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'tl1', orchard_id: 'o1' } }) }));
vi.mock('@/hooks/useAttendance', () => ({
    useAttendance: () => ({
        loading: false,
        processing: null,
        mergedList: [
            { id: 'p1', name: 'Ana Present', isPresent: true, attendanceRecord: { id: 'att-1', check_in: '2026-10-23T07:00:00+13:00' } },
            { id: 'p2', name: 'Bea Absent', isPresent: false },
            { id: 'p3', name: 'Cai Leave', isPresent: false },
        ],
        stats: { present: 1, absent: 2, total: 3 },
        checkIn: vi.fn(),
        checkOut: vi.fn(),
    }),
}));
vi.mock('@/hooks/useLeave', () => ({
    useLeaveOnDay: () => mocks.leaveToday,
    useMyLeaveRequests: () => ({ items: mocks.myItems, refetch: mocks.refetch }),
}));
vi.mock('@/services/leave.service', () => ({ leaveService: { requestOfflineFirst: mocks.requestOfflineFirst } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import AttendanceView from './AttendanceView';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.leaveToday = new Map([['p3', { picker_id: 'p3', type: 'sick' }]]);
    mocks.myItems = [];
});

describe('AttendanceView — leave', () => {
    it('marks people on approved leave, does not count them absent nor offer check-in', () => {
        render(<AttendanceView />);
        expect(screen.getByTestId('on-leave-p3').textContent).toBe('On leave (Sick leave)');
        expect(screen.getByTestId('on-leave-count').textContent).toContain('1');
        const row = screen.getByTestId('roll-p3');
        expect(within(row).queryByRole('button', { name: /Check In/i })).toBeNull();
        expect(within(screen.getByTestId('roll-p2')).getByRole('button', { name: /Check In/i })).toBeTruthy();
        // Ausentes: 2 sin fichar - 1 de permiso
        expect(screen.getByText('Absent').previousSibling?.textContent).toBe('1');
    });

    it('the team leader requests leave for someone of his team (queued without signal)', async () => {
        mocks.requestOfflineFirst.mockResolvedValue({ state: 'queued', queued: {} });
        render(<AttendanceView />);
        fireEvent.click(screen.getByRole('button', { name: 'Request leave for Bea Absent' }));
        const modal = screen.getByTestId('request-leave-modal');
        fireEvent.click(within(modal).getByRole('button', { name: 'Send request' }));
        await waitFor(() => expect(mocks.requestOfflineFirst).toHaveBeenCalled());
        expect(mocks.requestOfflineFirst.mock.calls[0][0]).toMatchObject({ orchardId: 'o1', pickerId: 'p2', type: 'sick', requestedBy: 'tl1' });
        expect(await screen.findByText(/No signal: the leave request for Bea Absent will be sent/)).toBeTruthy();
        expect(mocks.refetch).toHaveBeenCalled();
    });

    it('a check-in shows a success toast', async () => {
        render(<AttendanceView />);
        fireEvent.click(within(screen.getByTestId('roll-p2')).getByRole('button', { name: /Check In/i }));
        expect(await screen.findByText('Bea Absent checked in.')).toBeTruthy();
        expect(screen.getByText('check_circle')).toBeTruthy();
    });

    it('shows the status of what the team leader requested', () => {
        mocks.myItems = [
            { kind: 'queued', leave: { id: 'q1', picker_id: 'p2', type: 'day_off', start_date: '2026-10-24', end_date: '2026-10-24', half_day: false } },
            { kind: 'server', leave: { id: 's1', picker_id: 'p3', type: 'sick', start_date: '2026-10-23', end_date: '2026-10-23', half_day: false, status: 'approved', decision_note: null } },
            { kind: 'server', leave: { id: 's2', picker_id: 'p1', type: 'annual', start_date: '2026-11-01', end_date: '2026-11-03', half_day: false, status: 'rejected', decision_note: 'no cover' } },
        ];
        render(<AttendanceView />);
        expect(screen.getByTestId('my-leave-q1').textContent).toContain('Waiting for signal');
        expect(screen.getByTestId('my-leave-s1').textContent).toContain('Approved');
        expect(screen.getByTestId('my-leave-s2').textContent).toContain('Rejected');
        expect(screen.getByTestId('my-leave-s2').textContent).toContain('no cover');
    });
});
