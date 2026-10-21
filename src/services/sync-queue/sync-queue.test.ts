import { describe, it, expect, vi, afterEach } from 'vitest';
import { categorizeError, maxRetriesFor, isZodError } from './categorizeError';
import { summarizeQueue } from './queueStore';
import { dispatchSyncItem } from './dispatchItem';
import { qcRepository } from '@/repositories/qc.repository';
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

    // QC_INSPECTION: el esquema es estricto, así que tiene que conocer las columnas
    // nuevas (criterios, puntuación, fila, bienestar) o zod las quita del payload
    // encolado sin red y la inspección llega a la BD solo con la nota.
    describe('QC_INSPECTION (inspection queued offline)', () => {
        afterEach(() => vi.restoreAllMocks());

        const base = { orchard_id: 'o1', picker_id: 'p1', inspector_id: 'i1', grade: 'A' };
        const item = (payload: Record<string, unknown>): QueuedSyncItem =>
            ({ id: 'qc-1', type: 'QC_INSPECTION', payload, retryCount: 0, timestamp: 1 }) as unknown as QueuedSyncItem;

        it('passes criteria, score, row and the wellbeing answers through to the repository', async () => {
            const schemas = await import('../sync.schemas');
            const insert = vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
            const full = {
                ...base,
                grade: 'C',
                notes: 'n',
                photo_url: null,
                criteria: { ladder: 'ok', size: 'warn', damaged_fruit: 'bad' },
                score: 50,
                row_number: 14,
                informed: false,
                comfortable: true,
                wellbeing_notes: 'needs a briefing',
            };
            await expect(dispatchSyncItem(item(full), schemas)).resolves.toBe(true);
            expect(insert).toHaveBeenCalledWith(full);
        });

        it('a grade-only payload (previous format) still inserts, with the new columns null', async () => {
            const schemas = await import('../sync.schemas');
            const insert = vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
            await expect(dispatchSyncItem(item(base), schemas)).resolves.toBe(true);
            expect(insert).toHaveBeenCalledWith({
                ...base, notes: null, photo_url: null,
                criteria: null, score: null, row_number: null, informed: null, comfortable: null, wellbeing_notes: null,
            });
        });

        it('rejects an invalid payload before the repository (it ends in the dead letter queue)', async () => {
            const schemas = await import('../sync.schemas');
            const insert = vi.spyOn(qcRepository, 'insert');
            for (const bad of [
                { ...base, score: 140 },
                { ...base, criteria: { ladder: 'meh' } },
                { ...base, grade: 'D' },
                { ...base, informed: 'yes' },
            ]) {
                await expect(dispatchSyncItem(item(bad), schemas)).rejects.toSatisfy(isZodError);
            }
            expect(insert).not.toHaveBeenCalled();
        });
    });
});
