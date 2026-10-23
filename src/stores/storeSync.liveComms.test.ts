/**
 * Realtime de la tanda de comunicación: harvest_settings (meta, mínimo,
 * objetivo) llega al TL y al runner sin recargar, sin tocar el precio; y un
 * cambio de daily_attendance marca attendanceChangedAt (refresco de nómina).
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
vi.mock('@/repositories/piece-rates.repository', () => ({ pieceRatesRepository: { loadRange: vi.fn() } }));

import { setupRealtimeSubscriptions, type StoreGetter, type StoreSetter } from './storeSync';
import { applyHarvestSettingsChange } from './storeSyncLogic';
import type { HarvestStoreState } from './storeTypes';

function makeStore(initial: Partial<HarvestStoreState>) {
    let state = { recalculateIntelligence: vi.fn(), crew: [], ...initial } as unknown as HarvestStoreState;
    const get: StoreGetter = () => state;
    const set: StoreSetter = partial => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = { ...state, ...next };
    };
    return { get, set, state: () => state };
}

const settings = { piece_rate: 7.25, min_wage_rate: 23.95, min_buckets_per_hour: 4, target_tons: 10, piece_rates: [] };

describe('harvest_settings realtime', () => {
    beforeEach(() => { handlers.length = 0; });

    it('subscribes to harvest_settings of the orchard', () => {
        const store = makeStore({ orchard: { id: 'o1' }, settings } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        expect(handlers.find(h => h.filter.table === 'harvest_settings')?.filter)
            .toEqual({ event: '*', schema: 'public', table: 'harvest_settings', filter: 'orchard_id=eq.o1' });
    });

    it('a change updates goal and minimum, never the price', () => {
        const store = makeStore({ orchard: { id: 'o1' }, settings } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        handlers.find(h => h.filter.table === 'harvest_settings')!.fn({
            eventType: 'UPDATE',
            new: { orchard_id: 'o1', min_buckets_per_hour: '5.5', target_tons: 12, min_wage_rate: 23.95, piece_rate: 1 },
        });
        expect(store.state().settings).toMatchObject({ min_buckets_per_hour: 5.5, target_tons: 12, piece_rate: 7.25 });
        expect(store.get().recalculateIntelligence).toHaveBeenCalled();
    });

    it('applyHarvestSettingsChange keeps the same object when nothing changed', () => {
        expect(applyHarvestSettingsChange(settings, { target_tons: 10 })).toBe(settings);
        expect(applyHarvestSettingsChange(settings, null)).toBe(settings);
    });

    it('a live attendance change stamps attendanceChangedAt', () => {
        const store = makeStore({ orchard: { id: 'o1' }, settings, attendanceChangedAt: 0 } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        handlers.find(h => h.filter.table === 'daily_attendance')!.fn({ eventType: 'UPDATE', new: { picker_id: 'p1', date: '2020-01-01' } });
        expect(store.state().attendanceChangedAt).toBeGreaterThan(0);
    });
});
