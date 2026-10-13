import { describe, it, expect } from 'vitest';
import { categorizeError, maxRetriesFor, isZodError } from './categorizeError';
import { summarizeQueue } from './queueStore';
import { dispatchSyncItem } from './dispatchItem';
import type { QueuedSyncItem } from '../db';

describe('categorizeError (pure)', () => {
    it('the message wins over the code when it says something; otherwise the code decides', () => {
        const e = Object.assign(new Error('Failed to fetch'), { code: '23505' });
        expect(categorizeError(e, true)).toBe('network');
        const silent = Object.assign(new Error('odd'), { code: '23505' });
        expect(categorizeError(silent, true)).toBe('validation');
        expect(categorizeError({ code: 'PGRST301' }, true)).toBe('server');
    });

    it('a ZodError-shaped value is validation; offline is always network', () => {
        const zod = { name: 'ZodError', issues: [] };
        expect(isZodError(zod)).toBe(true);
        expect(categorizeError(zod, true)).toBe('validation');
        expect(categorizeError(zod, false)).toBe('network');
        expect(isZodError({ name: 'ZodError' })).toBe(false);
    });

    it('rate limiting (429) is a server error, a plain string is unknown', () => {
        expect(categorizeError(new Error('status 429 too many requests'), true)).toBe('server');
        expect(categorizeError('boom', true)).toBe('unknown');
    });

    it('retries per category: validation 5, server/unknown 50, network 200', () => {
        expect([maxRetriesFor('validation'), maxRetriesFor('server'), maxRetriesFor('unknown'), maxRetriesFor('network')])
            .toEqual([5, 50, 50, 200]);
    });
});

describe('summarizeQueue', () => {
    const item = (type: QueuedSyncItem['type'], retryCount: number, timestamp: number): QueuedSyncItem =>
        ({ id: `${type}-${timestamp}`, type, payload: {}, retryCount, timestamp });

    it('counts per type, highest retry and oldest timestamp', () => {
        const s = summarizeQueue([item('SCAN', 1, 30), item('SCAN', 7, 10), item('UNLINK', 2, 20)], 99);
        expect(s).toEqual({ total: 3, byType: { SCAN: 2, UNLINK: 1 }, maxRetry: 7, oldestTimestamp: 10, lastSync: 99 });
    });

    it('an empty queue has no oldest item and max retry 0', () => {
        expect(summarizeQueue([], null)).toEqual({ total: 0, byType: {}, maxRetry: 0, oldestTimestamp: null, lastSync: null });
    });
});

describe('dispatchSyncItem', () => {
    it('a type this version does not know (even an Object.prototype key) is reported, not processed', async () => {
        const schemas = await import('../sync.schemas');
        for (const type of ['LEGACY_THING', 'constructor', 'toString']) {
            const it = { id: 'x', type, payload: {}, retryCount: 0, timestamp: 1 } as unknown as QueuedSyncItem;
            await expect(dispatchSyncItem(it, schemas)).resolves.toBe(false);
        }
    });
});
