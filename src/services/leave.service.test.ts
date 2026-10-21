/**
 * leave.service — ausencias y permisos: lógica pura y escrituras validadas con Zod.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListInRange = vi.fn();
const mockListByPerson = vi.fn();
const mockInsert = vi.fn();
const mockSetStatus = vi.fn();

vi.mock('@/repositories/leave.repository', () => ({
    leaveRepository: {
        listInRange: (...a: unknown[]) => mockListInRange(...a),
        listByPerson: (...a: unknown[]) => mockListByPerson(...a),
        insert: (...a: unknown[]) => mockInsert(...a),
        setStatus: (...a: unknown[]) => mockSetStatus(...a),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { leaveService, leaveCoversDate, leaveDays, onLeaveOn, type LeaveRequest } from './leave.service';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const UUID3 = '33333333-3333-4333-8333-333333333333';

const row = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
    id: UUID, orchard_id: UUID2, picker_id: UUID3, type: 'annual', start_date: '2026-10-20', end_date: '2026-10-22',
    half_day: false, reason: null, status: 'requested', requested_by: null, decided_by: null, decided_at: null,
    decision_note: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('pure helpers', () => {
    it('leaveCoversDate is inclusive on both ends', () => {
        const l = row();
        expect(leaveCoversDate(l, '2026-10-19')).toBe(false);
        expect(leaveCoversDate(l, '2026-10-20')).toBe(true);
        expect(leaveCoversDate(l, '2026-10-22')).toBe(true);
        expect(leaveCoversDate(l, '2026-10-23')).toBe(false);
    });

    it('onLeaveOn: only approved leaves covering the day', () => {
        const leaves = [
            row({ picker_id: 'a', status: 'approved' }),
            row({ picker_id: 'b', status: 'requested' }),
            row({ picker_id: 'c', status: 'approved', start_date: '2026-10-23', end_date: '2026-10-23' }),
            row({ picker_id: 'd', status: 'cancelled' }),
        ];
        expect([...onLeaveOn(leaves, '2026-10-21')]).toEqual(['a']);
        expect([...onLeaveOn(leaves, '2026-10-23')]).toEqual(['c']);
    });

    it('leaveDays counts calendar days, half day = 0.5', () => {
        expect(leaveDays(row())).toBe(3);
        expect(leaveDays(row({ start_date: '2026-10-20', end_date: '2026-10-20' }))).toBe(1);
        expect(leaveDays(row({ half_day: true, end_date: '2026-10-20' }))).toBe(0.5);
    });
});

describe('leaveService', () => {
    it('listInRange validates rows and drops invalid ones', async () => {
        mockListInRange.mockResolvedValue([row(), { id: 'bad' }]);
        const out = await leaveService.listInRange('2026-10-01', '2026-10-31', UUID2);
        expect(mockListInRange).toHaveBeenCalledWith('2026-10-01', '2026-10-31', UUID2);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(UUID);
    });

    it('create: builds the insert from the form, defaults to requested, trims the reason', async () => {
        mockInsert.mockImplementation(async (r: Record<string, unknown>) => row({ ...r, id: UUID } as Partial<LeaveRequest>));
        const out = await leaveService.create({
            orchardId: UUID2, pickerId: UUID3, type: 'sick', startDate: '2026-10-20', endDate: '2026-10-21',
            reason: '  flu  ', requestedBy: UUID,
        });
        expect(mockInsert).toHaveBeenCalledWith({
            orchard_id: UUID2, picker_id: UUID3, type: 'sick', start_date: '2026-10-20', end_date: '2026-10-21',
            half_day: false, reason: 'flu', requested_by: UUID, status: 'requested',
        });
        expect(out.status).toBe('requested');
    });

    it('create: HR can register it already approved', async () => {
        mockInsert.mockImplementation(async (r: Record<string, unknown>) => row({ ...r } as Partial<LeaveRequest>));
        await leaveService.create({ orchardId: UUID2, pickerId: UUID3, type: 'annual', startDate: '2026-10-20', endDate: '2026-10-20', requestedBy: UUID, status: 'approved' });
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    it('create: rejects end before start, a half day over several days, and a bad type, without touching the DB', async () => {
        await expect(leaveService.create({ orchardId: UUID2, pickerId: UUID3, type: 'annual', startDate: '2026-10-22', endDate: '2026-10-20', requestedBy: null }))
            .rejects.toThrow(/end_date/);
        await expect(leaveService.create({ orchardId: UUID2, pickerId: UUID3, type: 'annual', startDate: '2026-10-20', endDate: '2026-10-22', halfDay: true, requestedBy: null }))
            .rejects.toThrow(/half_day/);
        await expect(leaveService.create({ orchardId: UUID2, pickerId: UUID3, type: 'holiday' as 'annual', startDate: '2026-10-20', endDate: '2026-10-20', requestedBy: null }))
            .rejects.toThrow(/type/);
        await expect(leaveService.create({ orchardId: 'o1', pickerId: UUID3, type: 'annual', startDate: '2026-10-20', endDate: '2026-10-20', requestedBy: null }))
            .rejects.toThrow(/orchard_id/);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('approve / reject / cancel set the status with who and when, and the optional note', async () => {
        mockSetStatus.mockImplementation(async (_id: string, u: Record<string, unknown>) => row({ ...u } as Partial<LeaveRequest>));
        const approved = await leaveService.approve(UUID, UUID2, '  ok  ');
        expect(mockSetStatus).toHaveBeenCalledWith(UUID, expect.objectContaining({ status: 'approved', decided_by: UUID2, decision_note: 'ok' }));
        expect(mockSetStatus.mock.calls[0][1].decided_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(approved.status).toBe('approved');

        await leaveService.reject(UUID, UUID2);
        expect(mockSetStatus).toHaveBeenLastCalledWith(UUID, expect.objectContaining({ status: 'rejected', decision_note: null }));

        await leaveService.cancel(UUID, null, '');
        expect(mockSetStatus).toHaveBeenLastCalledWith(UUID, expect.objectContaining({ status: 'cancelled', decided_by: null, decision_note: null }));
    });

    it('surfaces the repository error when the row is not updated (RLS: own leave)', async () => {
        mockSetStatus.mockRejectedValue(new Error('Leave request not found or not allowed'));
        await expect(leaveService.approve(UUID, UUID2)).rejects.toThrow(/not allowed/);
    });
});
