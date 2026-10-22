/**
 * Picker Repository Tests — vi.spyOn approach
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { pickerRepository } from './picker.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        update: vi.fn(() => chain), order: vi.fn(() => chain), range: vi.fn(() => chain), limit: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('pickerRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('updateStatus', () => {
        it('updates without throwing', async () => {
            await expect(pickerRepository.updateStatus('p1', 'active')).resolves.toBeUndefined();
            expect(fromSpy).toHaveBeenCalledWith('pickers');
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'Failed' } }) as never);
            await expect(pickerRepository.updateStatus('p1', 'active')).rejects.toBeTruthy();
        });
    });

    describe('getPerformanceToday', () => {
        it('returns performance data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: [{ picker_id: 'P-001', buckets: 50 }], error: null }) as never);
            const result = await pickerRepository.getPerformanceToday();
            expect(result).toEqual([{ picker_id: 'P-001', buckets: 50 }]);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            const result = await pickerRepository.getPerformanceToday();
            expect(result).toEqual([]);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
            await expect(pickerRepository.getPerformanceToday()).rejects.toBeTruthy();
        });

        it('filters by orchardId', async () => {
            const result = await pickerRepository.getPerformanceToday('orch-1');
            expect(result).toEqual([]);
        });
    });

    describe('getNamesByIds', () => {
        it('returns empty for empty ids', async () => {
            const result = await pickerRepository.getNamesByIds([]);
            expect(result).toEqual({});
        });

        it('returns id-to-name map', async () => {
            fromSpy.mockReturnValue(mockChain({ data: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }], error: null }) as never);
            const result = await pickerRepository.getNamesByIds(['1', '2']);
            expect(result).toEqual({ '1': 'John', '2': 'Jane' });
        });
    });
});
