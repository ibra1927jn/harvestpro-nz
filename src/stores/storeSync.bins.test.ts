/**
 * Realtime de bins para el runner (B6): los cambios de Logística llegan en vivo,
 * juntados en una lectura cada 2 s; un bin dado de baja desaparece al momento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handler = (payload: unknown) => void;
const handlers: Array<{ filter: Record<string, string>; fn: Handler }> = [];

vi.mock('@/services/supabase', () => {
    const channel = {
        on: vi.fn((_type: string, filter: Record<string, string>, fn: Handler) => { handlers.push({ filter, fn }); return channel; }),
        subscribe: vi.fn(),
    };
    return { supabase: { channel: vi.fn(() => channel), getChannels: vi.fn(() => []), removeChannel: vi.fn() } };
});

const getBins = vi.fn();
vi.mock('@/services/bin.service', () => ({ binService: { getBins: (...a: unknown[]) => getBins(...a) } }));

import { setupRealtimeSubscriptions, BINS_REALTIME_DEBOUNCE_MS, type StoreGetter, type StoreSetter } from './storeSync';
import type { HarvestStoreState } from './storeTypes';

function makeStore(initial: Partial<HarvestStoreState>) {
    let state = { recalculateIntelligence: vi.fn(), ...initial } as unknown as HarvestStoreState;
    const get: StoreGetter = () => state;
    const set: StoreSetter = partial => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = { ...state, ...next };
    };
    return { get, set, state: () => state };
}

describe('bins realtime (runner)', () => {
    beforeEach(() => { handlers.length = 0; getBins.mockReset(); vi.useFakeTimers(); });
    afterEach(() => vi.useRealTimers());

    it('coalesces a burst of bin changes into one reload after 2 s', async () => {
        getBins.mockResolvedValue([{ id: 'b1', status: 'collected', bin_code: 'B1', fillPercentage: 0, type: 'Standard' }]);
        const store = makeStore({ orchard: { id: 'o1' }, inventory: [{ id: 'b1', status: 'full', bin_code: 'B1', fillPercentage: 0, type: 'Standard' }] } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        const sub = handlers.find(h => h.filter.table === 'bins')!;
        expect(sub.filter).toEqual({ event: '*', schema: 'public', table: 'bins', filter: 'orchard_id=eq.o1' });
        sub.fn({ new: { id: 'b1', status: 'collected' } });
        sub.fn({ new: { id: 'b2', status: 'empty' } });
        expect(getBins).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(BINS_REALTIME_DEBOUNCE_MS);
        expect(getBins).toHaveBeenCalledTimes(1);
        expect(store.state().inventory[0].status).toBe('collected');
    });

    it('a retired bin leaves the runner\'s list at once', () => {
        getBins.mockResolvedValue([]);
        const store = makeStore({ orchard: { id: 'o1' }, inventory: [{ id: 'b1', status: 'full', bin_code: 'B1', fillPercentage: 0, type: 'Standard' }] } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        handlers.find(h => h.filter.table === 'bins')!.fn({ new: { id: 'b1', deleted_at: '2026-10-23T10:00:00Z' } });
        expect(store.state().inventory).toEqual([]);
    });
});
