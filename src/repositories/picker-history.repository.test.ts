/**
 * picker-history.repository — queries historia+perfil picker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { pickerHistoryRepository } from './picker-history.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => chain),
        single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

let fromSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
});

describe('pickerHistoryRepository.getPickerById', () => {
    it('devuelve data cuando OK', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'p1', name: 'Alice' }, error: null }) as never);
        const res = await pickerHistoryRepository.getPickerById('p1');
        expect(res).toEqual({ id: 'p1', name: 'Alice' });
    });

    it('devuelve null cuando error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        expect(await pickerHistoryRepository.getPickerById('p1')).toBeNull();
    });
});

describe('pickerHistoryRepository.getUserName', () => {
    it('devuelve full_name cuando existe', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { full_name: 'Bob' }, error: null }) as never);
        expect(await pickerHistoryRepository.getUserName('u1')).toBe('Bob');
    });

    it('devuelve null cuando full_name es null', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { full_name: null }, error: null }) as never);
        expect(await pickerHistoryRepository.getUserName('u1')).toBeNull();
    });

    it('devuelve null cuando no hay data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await pickerHistoryRepository.getUserName('u1')).toBeNull();
    });
});

describe('pickerHistoryRepository.getAttendanceSince', () => {
    it('devuelve array', async () => {
        fromSpy.mockReturnValue(
            mockChain({ data: [{ date: '2026-04-18' }, { date: '2026-04-17' }], error: null }) as never,
        );
        const res = await pickerHistoryRepository.getAttendanceSince('p1', '2026-04-10');
        expect(res).toHaveLength(2);
    });

    it('devuelve [] cuando data es null', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await pickerHistoryRepository.getAttendanceSince('p1', '2026-04-10')).toEqual([]);
    });
});

describe('pickerHistoryRepository.getBucketRecordsSince', () => {
    it('devuelve array', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'br1' }], error: null }) as never);
        const res = await pickerHistoryRepository.getBucketRecordsSince('p1', '2026-04-10T00:00Z');
        expect(res).toHaveLength(1);
    });
});

describe('pickerHistoryRepository.getInspectionsSince', () => {
    it('devuelve array', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'i1' }, { id: 'i2' }], error: null }) as never);
        const res = await pickerHistoryRepository.getInspectionsSince('p1', '2026-04-10T00:00Z');
        expect(res).toHaveLength(2);
        // Solo qc_inspections: quality_inspections (siempre vacía) ya no se consulta
        expect(fromSpy).toHaveBeenCalledWith('qc_inspections');
        expect(fromSpy).not.toHaveBeenCalledWith('quality_inspections');
    });

    it('[] cuando data null', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await pickerHistoryRepository.getInspectionsSince('p1', 's')).toEqual([]);
    });
});

describe('pickerHistoryRepository.getDaySetupsSince', () => {
    it('devuelve array de setups', async () => {
        fromSpy.mockReturnValue(
            mockChain({
                data: [{ date: '2026-04-18', variety: 'Hayward', piece_rate: 6.5, min_wage_rate: 23.95 }],
                error: null,
            }) as never,
        );
        const res = await pickerHistoryRepository.getDaySetupsSince('o1', '2026-04-10');
        expect((res as Array<{ variety: string }>)[0].variety).toBe('Hayward');
    });
});
