/**
 * Contract Repository Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { contractRepository2 } from './contract.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        not: vi.fn(() => chain), lte: vi.fn(() => chain), gte: vi.fn(() => chain),
        lt: vi.fn(() => chain), order: vi.fn(() => chain), range: vi.fn(() => chain), is: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('contractRepository2', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('listOpen', () => {
        it('returns draft, active and expiring contracts, paged with a stable order', async () => {
            const contracts = [{ id: 'c1', employee_id: 'e1', status: 'draft', end_date: null }];
            const chain = mockChain({ data: contracts, error: null });
            fromSpy.mockReturnValue(chain as never);
            const result = await contractRepository2.listOpen();
            expect(result).toEqual(contracts);
            expect(fromSpy).toHaveBeenCalledWith('contracts');
            expect(chain.in).toHaveBeenCalledWith('status', ['draft', 'active', 'expiring']);
            expect(chain.order).toHaveBeenCalledWith('id');
            expect(chain.range).toHaveBeenCalledWith(0, 999);
        });

        it('filters by orchardId', async () => {
            const chain = mockChain({ data: [], error: null });
            fromSpy.mockReturnValue(chain as never);
            const result = await contractRepository2.listOpen('orch-1');
            expect(result).toEqual([]);
            expect(chain.eq).toHaveBeenCalledWith('orchard_id', 'orch-1');
        });

        it('returns empty on null data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await contractRepository2.listOpen()).toEqual([]);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
            await expect(contractRepository2.listOpen()).rejects.toBeTruthy();
        });
    });

    describe('getAll', () => {
        it('returns all contracts sorted', async () => {
            const contracts = [{ id: 'c1', status: 'active' }];
            fromSpy.mockReturnValue(mockChain({ data: contracts, error: null }) as never);
            const result = await contractRepository2.getAll();
            expect(result).toEqual(contracts);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(contractRepository2.getAll()).rejects.toBeTruthy();
        });
    });

    describe('getExpiringSoon', () => {
        it('returns expiring contracts', async () => {
            const contracts = [{ id: 'c1', end_date: '2026-03-10' }];
            fromSpy.mockReturnValue(mockChain({ data: contracts, error: null }) as never);
            const result = await contractRepository2.getExpiringSoon('orch-1', '2026-03-04', '2026-03-18');
            expect(result).toEqual(contracts);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await contractRepository2.getExpiringSoon(undefined, '2026-03-04', '2026-03-18')).toEqual([]);
        });
    });

    describe('getExpiredButActive', () => {
        it('returns expired-active contracts', async () => {
            const result = await contractRepository2.getExpiredButActive();
            expect(result).toEqual([]);
            expect(fromSpy).toHaveBeenCalledWith('contracts');
        });

        it('filters by orchardId', async () => {
            const result = await contractRepository2.getExpiredButActive('orch-1');
            expect(result).toEqual([]);
        });
    });

    describe('getByEmployeeIds', () => {
        it('returns empty for empty ids', async () => {
            const result = await contractRepository2.getByEmployeeIds([]);
            expect(result).toEqual([]);
        });

        it('returns contracts by employee ids', async () => {
            const contracts = [{ employee_id: 'e1', type: 'permanent' }];
            fromSpy.mockReturnValue(mockChain({ data: contracts, error: null }) as never);
            const result = await contractRepository2.getByEmployeeIds(['e1']);
            expect(result).toEqual(contracts);
        });

        it('returns empty on null data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await contractRepository2.getByEmployeeIds(['e1'])).toEqual([]);
        });
    });
});
