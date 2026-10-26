/**
 * Pase de lista sin cobertura con la cola real (fake-indexeddb + syncService):
 * se guarda en el móvil con su id y su hora, se envía en orden al volver la red,
 * reintentar no duplica y un rechazo del servidor va a la cola de fallidos con el motivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.hoisted(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });

const api = vi.hoisted(() => ({ checkIn: vi.fn(), checkOut: vi.fn(), recordBreak: vi.fn() }));
vi.mock('./attendance.service', () => ({
    attendanceService: { checkInPicker: api.checkIn, checkOutPicker: api.checkOut, recordBreak: api.recordBreak },
}));
vi.mock('./conflict.service', () => ({ conflictService: { detect: vi.fn().mockResolvedValue(undefined), resolve: vi.fn() } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackSync: vi.fn(), trackDLQError: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { db } from './db';
import { syncService } from './sync.service';
import { rollCallService, applyQueuedRollCall, correctedNow, isOfflineFailure } from './rollCall.service';
import { useHarvestStore } from '@/stores/useHarvestStore';

const ORCH = 'o-1';
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, writable: true, configurable: true });
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

describe('rollCallService without signal', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await db.sync_queue.clear();
        await db.dead_letter_queue.clear();
        useHarvestStore.setState({ clockSkew: 0 });
        setOnline(false);
        api.checkIn.mockImplementation(async (pickerId: string, _o: string, _v: string, t: { clientId: string }) => ({ id: t.clientId, picker_id: pickerId }));
        api.checkOut.mockImplementation(async (id: string) => ({ id }));
        api.recordBreak.mockImplementation(async (_a: string, id: string) => ({ id }));
    });

    it('queues check-in, break and check-out with the phone id and time', async () => {
        const inRes = await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH, recordedBy: 'tl' });
        expect(inRes.state).toBe('queued');
        await rollCallService.record('break_start', { pickerId: 'p1', orchardId: ORCH, attendanceId: inRes.attendanceId });
        await rollCallService.record('check_out', { pickerId: 'p1', orchardId: ORCH, attendanceId: inRes.attendanceId });
        const queued = await rollCallService.listQueued();
        expect(queued.map(q => q.action)).toEqual(['check_in', 'break_start', 'check_out']);
        expect(new Set(queued.map(q => q.attendance_id))).toEqual(new Set([inRes.attendanceId]));
        expect(api.checkIn).not.toHaveBeenCalled();

        // La pantalla lo enseña ya: presente, en descanso, luego fuera; «pendiente»
        const view = applyQueuedRollCall([], queued.slice(0, 2));
        expect(view).toHaveLength(1);
        expect(view[0]).toMatchObject({ id: inRes.attendanceId, pending: true });
        expect(view[0].check_out).toBeFalsy();
        expect(view[0].break_start).toBeTruthy();
        expect(applyQueuedRollCall([], queued)[0].check_out).toBe(queued[2].at);
    });

    it('back online: sent in order with the same shift id, and the queue empties', async () => {
        const { attendanceId } = await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH });
        await rollCallService.record('check_out', { pickerId: 'p1', orchardId: ORCH, attendanceId });
        setOnline(true);
        await syncService._doProcessQueue();
        expect(api.checkIn).toHaveBeenCalledWith('p1', ORCH, undefined, expect.objectContaining({ clientId: attendanceId, skewApplied: 0 }));
        expect(typeof api.checkIn.mock.calls[0][3].at).toBe('string');
        expect(api.checkOut).toHaveBeenCalledWith(attendanceId, expect.objectContaining({ pickerId: 'p1' }));
        expect(api.checkIn.mock.invocationCallOrder[0]).toBeLessThan(api.checkOut.mock.invocationCallOrder[0]);
        expect(await db.sync_queue.count()).toBe(0);
    });

    it('a check-in that fails for a passing reason holds back the rest of that person', async () => {
        const { attendanceId } = await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH });
        await rollCallService.record('check_out', { pickerId: 'p1', orchardId: ORCH, attendanceId });
        await rollCallService.record('check_in', { pickerId: 'p2', orchardId: ORCH });
        setOnline(true);
        api.checkIn.mockImplementationOnce(async () => { throw httpError('Edge Function failed (503)', 503); });
        await syncService._doProcessQueue();
        expect(api.checkOut).not.toHaveBeenCalled();
        // La de otra persona no espera
        expect(api.checkIn).toHaveBeenCalledTimes(2);
        expect((await rollCallService.listQueued()).map(q => q.action)).toEqual(['check_in', 'check_out']);
    });

    it('a server refusal goes straight to the failed list with its reason', async () => {
        await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH });
        setOnline(true);
        api.checkIn.mockImplementationOnce(async () => { throw httpError('DAY_CLOSED: this day is closed. Only an admin can change its timesheets.', 409); });
        await syncService._doProcessQueue();
        expect(await db.sync_queue.count()).toBe(0);
        const dead = await syncService.getDeadLetters();
        expect(dead).toHaveLength(1);
        expect(dead[0].failureReason).toContain('DAY_CLOSED');
    });

    it('online with signal: sent right away; a network failure falls back to the queue', async () => {
        setOnline(true);
        const saved = await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH });
        expect(saved.state).toBe('saved');
        // Con red la hora la pone el servidor: no se manda la del móvil
        expect(api.checkIn.mock.calls[0][3]).toEqual({ clientId: saved.attendanceId });
        api.checkIn.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
        const queued = await rollCallService.record('check_in', { pickerId: 'p2', orchardId: ORCH });
        expect(queued.state).toBe('queued');
    });

    it('something of that person still queued: the new action waits behind it', async () => {
        const { attendanceId } = await rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH });
        setOnline(true);
        vi.spyOn(syncService, 'processQueue').mockResolvedValue(undefined);
        const res = await rollCallService.record('break_start', { pickerId: 'p1', orchardId: ORCH, attendanceId });
        expect(res.state).toBe('queued');
        expect(api.recordBreak).not.toHaveBeenCalled();
    });

    it('a server error that is not about signal is shown, not queued', async () => {
        setOnline(true);
        api.checkIn.mockImplementationOnce(async () => { throw httpError('You can only change attendance of your own team', 403); });
        await expect(rollCallService.record('check_in', { pickerId: 'p1', orchardId: ORCH })).rejects.toThrow('own team');
        expect(await db.sync_queue.count()).toBe(0);
    });
});

describe('phone clock', () => {
    it('a queued action carries the phone time already corrected and how much was corrected', async () => {
        setOnline(false);
        useHarvestStore.setState({ clockSkew: 10 * 60_000 });
        const before = Date.now();
        await rollCallService.record('check_in', { pickerId: 'p9', orchardId: ORCH });
        const [item] = await syncService.getQueue();
        const p = item.payload as { at: string; clock_skew_ms: number };
        expect(p.clock_skew_ms).toBe(10 * 60_000);
        expect(Date.parse(p.at) - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
        useHarvestStore.setState({ clockSkew: 0 });
        await db.sync_queue.clear();
    });

    it('corrects the time with the measured skew only when it is over 2 minutes', () => {
        const now = Date.parse('2026-10-23T08:00:00Z');
        expect(correctedNow(60_000, now)).toBe('2026-10-23T08:00:00.000Z');
        expect(correctedNow(5 * 60_000, now)).toBe('2026-10-23T08:05:00.000Z');
    });

    it('recognises failures caused by no signal', () => {
        expect(isOfflineFailure(new Error('x'), false)).toBe(true);
        expect(isOfflineFailure(Object.assign(new Error('Sin conexión'), { name: 'GatewayError:network' }), true)).toBe(true);
        expect(isOfflineFailure(httpError('DAY_CLOSED', 409), true)).toBe(false);
    });
});
