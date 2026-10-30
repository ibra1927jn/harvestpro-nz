/**
 * Escrituras de Flota y bins (B6): solo columnas reales, vacíos como null,
 * baja = deleted_at, y «sin filas» es un error (la RLS no dejó).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { toVehicleWrite, updateVehicle, addVehicle, retireVehicle, setBinStatus, addBin, retireBin, fetchFleet } from './logistics-dept.service';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), insert: vi.fn(() => chain), update: vi.fn(() => chain),
        eq: vi.fn(() => chain), is: vi.fn(() => chain), order: vi.fn(() => chain), range: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('vehicle writes', () => {
    it('keeps real columns only, blank text as null, capacity as a whole number', () => {
        expect(toVehicleWrite({ driver_name: ' ', registration: ' ab1 ', max_capacity: 6.4, last_update: 'x', bins_loaded: 3 } as never))
            .toEqual({ driver_name: null, registration: 'ab1', max_capacity: 6 });
        expect(toVehicleWrite({ name: '' })).toEqual({});
    });

    it('updates a vehicle and fails loudly when nothing changed', async () => {
        const chain = mockChain({ data: [{ id: 't1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await updateVehicle('t1', { driver_name: 'Mere', status: 'active' });
        expect(chain.update).toHaveBeenCalledWith({ driver_name: 'Mere', status: 'active' });
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
        await expect(updateVehicle('t1', { status: 'idle' })).rejects.toThrow(/not saved/);
    });

    it('adds a vehicle to the orchard (idle) and needs a name', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await addVehicle('o1', { name: 'Hilux', type: 'ute', max_capacity: 4 });
        expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([{ orchard_id: 'o1', status: 'idle', name: 'Hilux', type: 'ute', max_capacity: 4 }]);
        await expect(addVehicle('o1', { name: ' ' })).rejects.toThrow(/name/);
    });

    it('retiring sets deleted_at, and the fleet list skips retired vehicles', async () => {
        const chain = mockChain({ data: [{ id: 't1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await retireVehicle('t1');
        expect((chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty('deleted_at');
        const list = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(list as never);
        await fetchFleet();
        expect(list.is).toHaveBeenCalledWith('deleted_at', null);
    });
});

describe('bin writes', () => {
    it('sets status (full stamps filled_at, empty clears it)', async () => {
        const chain = mockChain({ data: [{ id: 'b1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await setBinStatus('b1', 'empty');
        expect(chain.update).toHaveBeenCalledWith({ status: 'empty', filled_at: null });
        await setBinStatus('b1', 'collected');
        expect(chain.update).toHaveBeenLastCalledWith({ status: 'collected' });
    });

    it('adds an empty bin with its zone and retires with deleted_at', async () => {
        const chain = mockChain({ data: [{ id: 'b1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await addBin('o1', ' B-9 ', 'A2');
        expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([{ orchard_id: 'o1', bin_code: 'B-9', status: 'empty', location: { zone: 'A2' } }]);
        await expect(addBin('o1', '  ')).rejects.toThrow(/code/);
        await retireBin('b1');
        expect((chain.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toHaveProperty('deleted_at');
    });
});
