/**
 * HarvestSyncBridge — sube las cubetas pendientes por record-bucket
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: (...a: unknown[]) => invoke(...a) },
}));
vi.mock('../../services/offline.service', () => ({
    offlineService: { cleanupSynced: vi.fn().mockResolvedValue(undefined) },
}));

const markAsSynced = vi.fn();
const markAsFailed = vi.fn();
let buckets: Array<Record<string, unknown>> = [];
vi.mock('../../stores/useHarvestStore', () => ({
    useHarvestStore: { getState: () => ({ buckets, markAsSynced, markAsFailed }) },
}));

import { HarvestSyncBridge } from './HarvestSyncBridge';

const b = (id: string, ts: string, extra: Record<string, unknown> = {}) => ({
    id, picker_id: 'LOC-018', quality_grade: 'A', timestamp: ts, orchard_id: 'o1', synced: false, ...extra,
});

let online = true;
beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset(); markAsSynced.mockReset(); markAsFailed.mockReset();
    online = true;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});
afterEach(() => { vi.useRealTimers(); });

describe('HarvestSyncBridge', () => {
    it('uploads pending scans oldest first and handles each result', async () => {
        buckets = [
            b('3', '2026-10-12T10:03:00+13:00', { row_number: 4 }),
            b('1', '2026-10-12T10:01:00+13:00'),
            b('2', '2026-10-12T10:02:00+13:00'),
            b('4', '2026-10-12T10:04:00+13:00', { failed: true }),
            b('5', '2026-10-12T10:05:00+13:00', { synced: true }),
        ];
        invoke.mockResolvedValue({ data: { results: [
            { id: '1', status: 'saved' },
            { id: '2', status: 'duplicate' },
            { id: '3', status: 'rejected', reason: 'PAY_WEEK_CLOSED' },
        ] }, error: null });

        await act(async () => { render(<HarvestSyncBridge />); });

        expect(invoke).toHaveBeenCalledTimes(1);
        const [fn, body] = invoke.mock.calls[0];
        expect(fn).toBe('record-bucket');
        const scans = (body as { scans: Array<Record<string, unknown>> }).scans;
        expect(scans.map(s => s.id)).toEqual(['1', '2', '3']);
        expect(scans[0].scanned_at).toBe('2026-10-12T10:01:00+13:00');
        expect(scans[2].row_number).toBe(4);
        expect(markAsSynced.mock.calls.map(c => c[0])).toEqual(['1', '2']);
        expect(markAsFailed).toHaveBeenCalledWith('3', 'PAY_WEEK_CLOSED');
    });

    it('waits while offline and uploads as soon as the connection is back', async () => {
        buckets = [b('1', '2026-10-12T10:01:00+13:00')];
        online = false;
        invoke.mockResolvedValue({ data: { results: [{ id: '1', status: 'saved' }] }, error: null });

        await act(async () => { render(<HarvestSyncBridge />); });
        expect(invoke).not.toHaveBeenCalled();

        online = true;
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(markAsSynced).toHaveBeenCalledWith('1');
    });

    it('keeps scans pending when the request fails (no network)', async () => {
        buckets = [b('1', '2026-10-12T10:01:00+13:00')];
        invoke.mockRejectedValue(new Error('Failed to fetch'));
        await act(async () => { render(<HarvestSyncBridge />); });
        expect(markAsSynced).not.toHaveBeenCalled();
        expect(markAsFailed).not.toHaveBeenCalled();
    });
});
