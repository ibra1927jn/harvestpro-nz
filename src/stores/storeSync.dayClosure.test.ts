/**
 * Realtime de day_closures (B2): cuando el manager cierra el día, el TL y el
 * runner lo saben al momento (store.dayClosed), y un admin que lo reabre también.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (payload: unknown) => void;
const handlers: Array<{ filter: Record<string, string>; fn: Handler }> = [];

vi.mock('@/services/supabase', () => {
    const channel = {
        on: vi.fn((_type: string, filter: Record<string, string>, fn: Handler) => { handlers.push({ filter, fn }); return channel; }),
        subscribe: vi.fn(),
    };
    return { supabase: { channel: vi.fn(() => channel), getChannels: vi.fn(() => []), removeChannel: vi.fn() } };
});

vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-10-23',
}));

import { setupRealtimeSubscriptions, type StoreGetter, type StoreSetter } from './storeSync';
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

describe('day_closures realtime', () => {
    beforeEach(() => { handlers.length = 0; });

    it('subscribes to the orchard closures and follows close / reopen of today', () => {
        const store = makeStore({ dayClosed: false } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        const sub = handlers.find(h => h.filter.table === 'day_closures');
        expect(sub?.filter).toEqual({ event: '*', schema: 'public', table: 'day_closures', filter: 'orchard_id=eq.o1' });
        sub!.fn({ new: { date: '2026-10-23', status: 'closed' } });
        expect(store.state().dayClosed).toBe(true);
        sub!.fn({ new: { date: '2026-10-23', status: 'open' } });
        expect(store.state().dayClosed).toBe(false);
    });

    it('ignores closures of other days', () => {
        const store = makeStore({ dayClosed: false } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        handlers.find(h => h.filter.table === 'day_closures')!.fn({ new: { date: '2026-10-22', status: 'closed' } });
        expect(store.state().dayClosed).toBe(false);
    });
});
