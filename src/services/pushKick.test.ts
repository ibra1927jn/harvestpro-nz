/**
 * pushKick — tras escribir un evento que avisa, se despierta send-push (una vez por ráfaga).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPushEventRequest, pushAwareFetch } from './pushKick';

const BASE = 'http://127.0.0.1:54321';

describe('isPushEventRequest', () => {
    it('matches writes to tables whose changes notify someone', () => {
        expect(isPushEventRequest(`${BASE}/rest/v1/qc_inspections`, 'POST')).toBe(true);
        expect(isPushEventRequest(`${BASE}/rest/v1/chat_messages?select=*`, 'POST')).toBe(true);
        expect(isPushEventRequest(`${BASE}/rest/v1/transport_requests?id=eq.1`, 'PATCH')).toBe(true);
        expect(isPushEventRequest(`${BASE}/functions/v1/approve-timesheet`, 'POST')).toBe(true);
    });

    it('ignores reads, other tables and send-push itself', () => {
        expect(isPushEventRequest(`${BASE}/rest/v1/qc_inspections?select=*`, 'GET')).toBe(false);
        expect(isPushEventRequest(`${BASE}/rest/v1/bucket_records`, 'POST')).toBe(false);
        expect(isPushEventRequest(`${BASE}/functions/v1/send-push`, 'POST')).toBe(false);
        expect(isPushEventRequest('not a url at all', 'POST')).toBe(false);
    });
});

describe('pushAwareFetch', () => {
    const realFetch = globalThis.fetch;
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        globalThis.fetch = realFetch;
    });

    it('flushes once after a burst of successful event writes', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
        const flush = vi.fn().mockResolvedValue(undefined);
        const f = pushAwareFetch(flush);
        await f(`${BASE}/rest/v1/chat_messages`, { method: 'POST' });
        await f(`${BASE}/rest/v1/chat_messages`, { method: 'POST' });
        expect(flush).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(flush).toHaveBeenCalledTimes(1);
    });

    it('does not flush when the write failed', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
        const flush = vi.fn().mockResolvedValue(undefined);
        await pushAwareFetch(flush)(`${BASE}/rest/v1/broadcasts`, { method: 'POST' });
        await vi.advanceTimersByTimeAsync(2000);
        expect(flush).not.toHaveBeenCalled();
    });

    it('a failing flush never surfaces', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
        const flush = vi.fn().mockRejectedValue(new Error('offline'));
        const res = await pushAwareFetch(flush)(`${BASE}/rest/v1/broadcasts`, { method: 'POST' });
        expect(res.status).toBe(201);
        await vi.advanceTimersByTimeAsync(2000);
        expect(flush).toHaveBeenCalled();
    });
});
