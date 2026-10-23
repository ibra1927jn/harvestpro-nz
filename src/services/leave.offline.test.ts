/**
 * Ausencia pedida por el team leader: con red va directa; sin red, a la cola
 * LEAVE_REQUEST con el id del móvil (reintento sin duplicar).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), addToQueue: vi.fn(), getQueue: vi.fn() }));
vi.mock('@/repositories/leave.repository', () => ({
    leaveRepository: { insert: mocks.insert, listInRange: vi.fn(), listByPerson: vi.fn(), setStatus: vi.fn(), listRequestedBy: vi.fn() },
}));
vi.mock('./sync.service', () => ({ syncService: { addToQueue: mocks.addToQueue, getQueue: mocks.getQueue } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { leaveService, leaveByPickerOn, isNetworkFailure, type LeaveRequest } from './leave.service';
import { processLeaveRequest } from './sync-processors/leave.processor';
import { LeaveRequestPayloadSchema } from './sync.schemas';

const ORCH = '22222222-2222-4222-8222-222222222222';
const PICK = '33333333-3333-4333-8333-333333333333';
const TL = '44444444-4444-4444-8444-444444444444';
const input = { orchardId: ORCH, pickerId: PICK, type: 'sick' as const, startDate: '2026-10-23', endDate: '2026-10-24', halfDay: false, reason: ' flu ', requestedBy: TL };

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => { vi.clearAllMocks(); setOnline(true); });
afterEach(() => setOnline(true));

describe('leaveByPickerOn / isNetworkFailure', () => {
    it('keeps the approved leave covering the day, per person', () => {
        const base = { id: 'x', orchard_id: ORCH, half_day: false, reason: null, requested_by: null, decided_by: null, decided_at: null, decision_note: null, created_at: '', updated_at: '' };
        const leaves = [
            { ...base, picker_id: 'a', type: 'sick', status: 'approved', start_date: '2026-10-22', end_date: '2026-10-24' },
            { ...base, picker_id: 'b', type: 'annual', status: 'requested', start_date: '2026-10-23', end_date: '2026-10-23' },
            { ...base, picker_id: 'c', type: 'annual', status: 'approved', start_date: '2026-10-24', end_date: '2026-10-25' },
        ] as LeaveRequest[];
        const m = leaveByPickerOn(leaves, '2026-10-23');
        expect([...m.keys()]).toEqual(['a']);
        expect(m.get('a')?.type).toBe('sick');
    });

    it('detects network failures', () => {
        expect(isNetworkFailure(new Error('x'), false)).toBe(true);
        expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true);
        expect(isNetworkFailure({ message: 'new row violates row-level security policy' }, true)).toBe(false);
    });
});

describe('requestOfflineFirst', () => {
    it('online: inserts as requested with a client id', async () => {
        mocks.insert.mockImplementation(async (row: Record<string, unknown>) => ({
            ...row, decided_by: null, decided_at: null, decision_note: null, created_at: 'c', updated_at: 'u',
        }));
        const res = await leaveService.requestOfflineFirst(input);
        expect(res.state).toBe('saved');
        const row = mocks.insert.mock.calls[0][0];
        expect(row).toMatchObject({ status: 'requested', picker_id: PICK, reason: 'flu', requested_by: TL });
        expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(mocks.addToQueue).not.toHaveBeenCalled();
    });

    it('offline: goes to the LEAVE_REQUEST queue with a valid payload', async () => {
        setOnline(false);
        const res = await leaveService.requestOfflineFirst({ ...input, halfDay: true });
        expect(res.state).toBe('queued');
        expect(mocks.insert).not.toHaveBeenCalled();
        const [type, payload] = mocks.addToQueue.mock.calls[0];
        expect(type).toBe('LEAVE_REQUEST');
        // Medio día = un solo día
        expect(payload).toMatchObject({ start_date: '2026-10-23', end_date: '2026-10-23', half_day: true, orchard_id: ORCH });
        expect(LeaveRequestPayloadSchema.safeParse(payload).success).toBe(true);
    });

    it('network error while online also queues; an RLS error is thrown', async () => {
        mocks.insert.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        expect((await leaveService.requestOfflineFirst(input)).state).toBe('queued');
        mocks.insert.mockRejectedValueOnce({ code: '42501', message: 'new row violates row-level security policy' });
        await expect(leaveService.requestOfflineFirst(input)).rejects.toBeTruthy();
    });

    it('lists the queued requests', async () => {
        mocks.getQueue.mockResolvedValue([
            { type: 'LEAVE_REQUEST', payload: { id: 'q1', picker_id: PICK } },
            { type: 'SCAN', payload: {} },
        ]);
        expect((await leaveService.listQueued()).map(q => q.id)).toEqual(['q1']);
    });
});

describe('processLeaveRequest', () => {
    const payload = { id: '55555555-5555-4555-8555-555555555555', orchard_id: ORCH, picker_id: PICK, type: 'sick' as const, start_date: '2026-10-23', end_date: '2026-10-23', half_day: false, reason: null, requested_by: TL };

    it('inserts it as requested', async () => {
        mocks.insert.mockResolvedValue({});
        await processLeaveRequest(payload);
        expect(mocks.insert).toHaveBeenCalledWith({ ...payload, status: 'requested' });
    });

    it('a duplicate (already uploaded) is fine; other errors throw', async () => {
        mocks.insert.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value' });
        await expect(processLeaveRequest(payload)).resolves.toBeUndefined();
        mocks.insert.mockRejectedValueOnce({ code: '42501', message: 'rls' });
        await expect(processLeaveRequest(payload)).rejects.toThrow(/not saved/);
    });

    it('the queue schema rejects a half day over several days', () => {
        expect(LeaveRequestPayloadSchema.safeParse({ ...payload, half_day: true, end_date: '2026-10-24' }).success).toBe(false);
    });
});
