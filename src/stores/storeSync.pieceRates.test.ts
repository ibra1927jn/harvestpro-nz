/**
 * Realtime de piece_rates: cuando el manager cambia el precio de hoy, el TL y
 * el runner lo ven sin recargar (storeSync relee los precios de hoy).
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

const loadRange = vi.fn();
vi.mock('@/repositories/piece-rates.repository', () => ({
    pieceRatesRepository: { loadRange: (...a: unknown[]) => loadRange(...a) },
}));

vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-10-23',
}));

import { setupRealtimeSubscriptions, refreshTodayPieceRates, type StoreGetter, type StoreSetter } from './storeSync';
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

const rates = [
    { orchardId: 'o1', variety: null, effectiveDate: '2026-10-23', pieceRate: 7.25 },
    { orchardId: 'o1', variety: 'Braeburn', effectiveDate: '2026-10-20', pieceRate: 8.1 },
];

describe('piece_rates realtime', () => {
    beforeEach(() => {
        handlers.length = 0;
        loadRange.mockReset();
    });

    it('se suscribe a piece_rates del huerto', () => {
        const store = makeStore({ orchard: { id: 'o1', name: 'A' } } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        const sub = handlers.find(h => h.filter.table === 'piece_rates');
        expect(sub?.filter).toEqual({ event: '*', schema: 'public', table: 'piece_rates', filter: 'orchard_id=eq.o1' });
    });

    it('un cambio relee los precios de hoy y actualiza el precio general del store', async () => {
        loadRange.mockResolvedValue(rates);
        const store = makeStore({
            orchard: { id: 'o1', name: 'A' },
            settings: { piece_rate: 6.5, min_wage_rate: 23.95, min_buckets_per_hour: 4, target_tons: 10 },
        } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        handlers.find(h => h.filter.table === 'piece_rates')?.fn({ eventType: 'UPDATE', new: {} });
        await vi.waitFor(() => expect(store.state().settings.piece_rate).toBe(7.25));
        expect(loadRange).toHaveBeenCalledWith('2026-10-23', '2026-10-23', 'o1');
        expect(store.state().settings.piece_rates).toEqual(rates);
        expect(store.state().settings.min_wage_rate).toBe(23.95);
        expect(store.get().recalculateIntelligence).toHaveBeenCalled();
    });

    it('si mientras tanto se cambió de huerto, no pisa los ajustes del otro', async () => {
        loadRange.mockResolvedValue(rates);
        const store = makeStore({
            orchard: { id: 'o2', name: 'B' },
            settings: { piece_rate: 6.5, min_wage_rate: 23.95, min_buckets_per_hour: 4, target_tons: 10 },
        } as Partial<HarvestStoreState>);
        await refreshTodayPieceRates('o1', store.get, store.set);
        expect(store.state().settings.piece_rate).toBe(6.5);
    });

    it('sin conexión deja los precios que había', async () => {
        loadRange.mockRejectedValue(new Error('offline'));
        const store = makeStore({
            orchard: { id: 'o1', name: 'A' },
            settings: { piece_rate: 6.5, min_wage_rate: 23.95, min_buckets_per_hour: 4, target_tons: 10, piece_rates: rates },
        } as Partial<HarvestStoreState>);
        await refreshTodayPieceRates('o1', store.get, store.set);
        expect(store.state().settings.piece_rates).toEqual(rates);
    });
});
