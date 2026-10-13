/**
 * Audit Repository Tests — vi.spyOn approach
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { auditRepository } from './audit.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), insert: vi.fn(() => chain),
        order: vi.fn(() => chain), limit: vi.fn(() => chain), gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('auditRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ error: null }) as never);
    });

    it('insertSafe does not throw on success', async () => {
        await expect(auditRepository.insertSafe({ action: 'LOGIN' })).resolves.toBeUndefined();
    });

    it('insertSafe does not throw on error (best-effort)', async () => {
        fromSpy.mockReturnValue(mockChain({ error: { message: 'Insert failed' } }) as never);
        await expect(auditRepository.insertSafe({ action: 'LOGIN' })).resolves.toBeUndefined();
    });

    it('insertBatch succeeds', async () => {
        await expect(auditRepository.insertBatch([{ action: 'A' }])).resolves.toBeUndefined();
    });

    it('insertBatch throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ error: { message: 'Batch failed' } }) as never);
        await expect(auditRepository.insertBatch([{ action: 'A' }])).rejects.toBeTruthy();
    });

    it('query returns logs', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: '1', action: 'INSERT' }], error: null }) as never);
        const result = await auditRepository.query({ action: 'INSERT' });
        expect(result).toEqual([{ id: '1', action: 'INSERT' }]);
    });

    it('query throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(auditRepository.query({})).rejects.toBeTruthy();
    });
});
