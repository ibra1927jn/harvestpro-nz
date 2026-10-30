/**
 * Presencia para quien no lee todos los fichajes (RLS 20261024021000): el
 * runner, QC y logística (y el TL fuera de su equipo) la reciben de
 * presence_today cada minuto; manager, RRHH, nómina y admin no la piden.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getPresenceToday = vi.fn();
const getOpenShiftsElsewhere = vi.fn();

vi.mock('@/services/supabase', () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn() };
    return { supabase: { channel: vi.fn(() => channel), getChannels: vi.fn(() => []), removeChannel: vi.fn() } };
});
vi.mock('@/repositories/store-sync.repository', () => ({
    storeSyncRepository: {
        getPresenceToday: (...a: unknown[]) => getPresenceToday(...a),
        getOpenShiftsElsewhere: (...a: unknown[]) => getOpenShiftsElsewhere(...a),
    },
}));

import { PRESENCE_REFRESH_MS, elsewhereFromPresenceOnly, loadShiftsElsewhere, needsPresence, refreshPresence, setupRealtimeSubscriptions, type StoreGetter, type StoreSetter } from './storeSync';
import type { HarvestStoreState } from './storeTypes';
import type { Picker } from '@/types';

function makeStore(initial: Partial<HarvestStoreState>) {
    let state = { recalculateIntelligence: vi.fn(), ...initial } as unknown as HarvestStoreState;
    const get: StoreGetter = () => state;
    const set: StoreSetter = partial => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = { ...state, ...next };
    };
    return { get, set, state: () => state };
}

const crew = [{ id: 'p1', name: 'Ana', status: 'active', role: 'picker', current_row: 0 } as Picker];
const presentRow = {
    picker_id: 'p1', present: true, since: '2026-10-24T19:00:00Z', on_break: false, on_leave: false,
    checked_in_today: true, left_at: null, elsewhere_orchard_id: null, elsewhere_orchard_name: null,
};

describe('presence for roles that do not read all attendance', () => {
    beforeEach(() => { vi.useFakeTimers(); getPresenceToday.mockReset(); });
    afterEach(() => { vi.useRealTimers(); });

    it('only the office roles skip it', () => {
        for (const r of ['runner', 'qc_inspector', 'logistics', 'team_leader', null]) expect(needsPresence(r)).toBe(true);
        for (const r of ['manager', 'admin', 'hr_admin', 'payroll_admin']) expect(needsPresence(r)).toBe(false);
    });

    it('a runner reloads presence every minute and sees who is checked in', async () => {
        getPresenceToday.mockResolvedValue([presentRow]);
        const store = makeStore({ crew, orchard: { id: 'o1' }, currentUser: { id: 'r1', name: 'R', role: 'runner' } } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        await vi.advanceTimersByTimeAsync(PRESENCE_REFRESH_MS + 10);
        expect(getPresenceToday).toHaveBeenCalledWith('o1');
        expect(store.state().crew[0].check_in).toBe('2026-10-24T19:00:00Z');
    });

    it('a manager gets attendance by realtime: no polling', async () => {
        const store = makeStore({ crew, orchard: { id: 'o1' }, currentUser: { id: 'm1', name: 'M', role: 'manager' } } as Partial<HarvestStoreState>);
        setupRealtimeSubscriptions('o1', store.get, store.set);
        await vi.advanceTimersByTimeAsync(3 * PRESENCE_REFRESH_MS);
        expect(getPresenceToday).not.toHaveBeenCalled();
    });

    it('no signal: the previous presence stays', async () => {
        getPresenceToday.mockRejectedValue(new TypeError('Failed to fetch'));
        const before = [{ ...crew[0], checked_in_today: true, check_in: 'x' }];
        const store = makeStore({ crew: before, orchard: { id: 'o1' } } as Partial<HarvestStoreState>);
        await refreshPresence(store.get, store.set, 'o1');
        expect(store.state().crew).toBe(before);
    });
});

// Migración 20261027070000: el manager no lee los tramos de otro huerto. «Ahora en
// otro huerto» le llega de presence_today (solo el huerto, sin hora de allí).
describe('manager: "now in another orchard" from presence_today', () => {
    beforeEach(() => { getPresenceToday.mockReset(); getOpenShiftsElsewhere.mockReset(); });

    it('only the manager uses presence for it', () => {
        expect(elsewhereFromPresenceOnly('manager')).toBe(true);
        for (const r of ['admin', 'hr_admin', 'payroll_admin', 'team_leader', 'runner', null]) expect(elsewhereFromPresenceOnly(r)).toBe(false);
    });

    it('marks the picker as elsewhere with no time from there, and keeps own-orchard attendance', async () => {
        getPresenceToday.mockResolvedValue([{ ...presentRow, present: false, since: null, elsewhere_orchard_id: 'o2', elsewhere_orchard_name: 'Orchard B' }]);
        const own = [{ ...crew[0], check_in: '2026-10-24T18:00:00Z', check_out: '2026-10-24T20:00:00Z' }];
        const store = makeStore({ crew: own, orchard: { id: 'o1' }, currentUser: { id: 'm1', name: 'M', role: 'manager' } } as Partial<HarvestStoreState>);
        await loadShiftsElsewhere(store.get, store.set, 'o1', '2026-10-25');
        expect(getOpenShiftsElsewhere).not.toHaveBeenCalled();
        expect(getPresenceToday).toHaveBeenCalledWith('o1');
        const p = store.state().crew[0];
        expect(p.elsewhere).toEqual({ orchard_id: 'o2', orchard_name: 'Orchard B', since: null });
        expect([p.check_in, p.check_out]).toEqual(['2026-10-24T18:00:00Z', '2026-10-24T20:00:00Z']);
    });

    it('the office still reads the open shifts of other orchards', async () => {
        getOpenShiftsElsewhere.mockResolvedValue([{ picker_id: 'p1', orchard_id: 'o2', check_in: '2026-10-24T21:00:00Z', orchards: { name: 'Orchard B' } }]);
        const store = makeStore({ crew, orchard: { id: 'o1' }, currentUser: { id: 'h1', name: 'H', role: 'hr_admin' } } as Partial<HarvestStoreState>);
        await loadShiftsElsewhere(store.get, store.set, 'o1', '2026-10-25');
        expect(getPresenceToday).not.toHaveBeenCalled();
        expect(store.state().crew[0].elsewhere?.since).toBe('2026-10-24T21:00:00Z');
    });
});
