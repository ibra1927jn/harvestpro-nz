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

    it('no longer reads the broken pickers_performance_today view (always 0)', () => {
        expect('getPerformanceToday' in pickerRepository).toBe(false);
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
