/**
 * analytics-trends.repository — aggregate queries for trend charts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { analyticsTrendsRepository } from './analytics-trends.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain), is: vi.fn(() => chain), range: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('analyticsTrendsRepository.getBucketsByRowInRange', () => {
    it('devuelve records cuando OK', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: [{ row_number: 1, picker_id: 'p1', scanned_at: '2026-04-18T09:00:00Z' }], error: null }) as never,
        );
        const res = await analyticsTrendsRepository.getBucketsByRowInRange('o1', '2026-04-01', '2026-04-18');
        expect(res).toHaveLength(1);
    });

    it('[] cuando data null', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await analyticsTrendsRepository.getBucketsByRowInRange('o1', '2026-04-01', '2026-04-18')).toEqual([]);
    });

    it('throws cuando error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        await expect(analyticsTrendsRepository.getBucketsByRowInRange('o1', '2026-04-01', '2026-04-18')).rejects.toBeTruthy();
    });
});

describe('analyticsTrendsRepository.getDayClosures', () => {
    it('ordena por date ASC', async () => {
        const chain = mockChain({ data: [{ date: '2026-04-18' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await analyticsTrendsRepository.getDayClosures('o1', '2026-04-01', '2026-04-18');
        expect((chain.order as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('date');
    });

    it('devuelve [] cuando data null', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await analyticsTrendsRepository.getDayClosures('o1', 's', 'e')).toEqual([]);
    });
});

describe('analyticsTrendsRepository.getAttendanceDates', () => {
    it('devuelve attendance rows', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: [{ date: '2026-04-18', picker_id: 'p1' }], error: null }) as never,
        );
        const res = await analyticsTrendsRepository.getAttendanceDates('o1', '2026-04-01', '2026-04-18');
        expect(res).toHaveLength(1);
    });

    it('throws en error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: null, error: { message: 'rls denied' } }) as never,
        );
        await expect(analyticsTrendsRepository.getAttendanceDates('o1', 's', 'e')).rejects.toBeTruthy();
    });
});
