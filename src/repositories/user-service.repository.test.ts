/**
 * user-service.repository — cross-table ops sobre users/pickers/daily_attendance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { userServiceRepository } from './user-service.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        is: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('userServiceRepository.getUserById', () => {
    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'x' } }) as never);
        await expect(userServiceRepository.getUserById('u1')).rejects.toBeTruthy();
    });

    it('returns data on success', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: { id: 'u1', role: 'manager' }, error: null }) as never);
        expect(await userServiceRepository.getUserById('u1')).toEqual({ id: 'u1', role: 'manager' });
    });
});

describe('userServiceRepository.getUsersByOrchard', () => {
    it('orden por role', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.getUsersByOrchard('o1');
        expect((chain.order as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('role');
    });

    it('[] cuando data null', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await userServiceRepository.getUsersByOrchard('o1')).toEqual([]);
    });
});

describe('userServiceRepository.getAvailableUsers', () => {
    it('sin role, sólo filtra is_active', async () => {
        const chain = mockChain({ data: [{ id: 'u1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.getAvailableUsers();
        expect((chain.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('is_active', true);
    });

    it('con role añade segundo filtro', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.getAvailableUsers('picker');
        expect((chain.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('role', 'picker');
    });
});

describe('userServiceRepository.getUsersByRole', () => {
    it('order full_name', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.getUsersByRole('team_leader');
        expect((chain.order as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('full_name');
    });
});

describe('userServiceRepository.updateUserOrchard', () => {
    it('con orchardId payload includes is_active:true', async () => {
        const chain = mockChain({ data: { id: 'u1' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.updateUserOrchard('u1', 'o1');
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ orchard_id: 'o1', is_active: true });
    });

    it('orchardId null → solo orchard_id:null', async () => {
        const chain = mockChain({ data: { id: 'u1' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.updateUserOrchard('u1', null);
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ orchard_id: null });
    });
});

describe('userServiceRepository.clearUserOrchard', () => {
    it('update solo orchard_id:null + eq id', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.clearUserOrchard('u1');
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ orchard_id: null });
    });
});

describe('userServiceRepository.findPickerById / verifyPickerState / findTodayAttendance', () => {
    it('findPickerById devuelve data o null', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: { id: 'p1' }, error: null }) as never);
        expect(await userServiceRepository.findPickerById('p1')).toEqual({ id: 'p1' });
    });

    it('verifyPickerState incluye orchard_id + status', async () => {
        const chain = mockChain({ data: { id: 'p1', orchard_id: 'o1', status: 'active' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const r = await userServiceRepository.verifyPickerState('p1');
        expect(r).toMatchObject({ orchard_id: 'o1', status: 'active' });
    });

    it('findTodayAttendance filtra picker + date', async () => {
        const chain = mockChain({ data: { id: 'att1' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await userServiceRepository.findTodayAttendance('p1', '2026-04-18');
        expect((chain.eq as ReturnType<typeof vi.fn>)).toHaveBeenNthCalledWith(1, 'picker_id', 'p1');
    });
});

describe('userServiceRepository picker CRUD wrappers (updatePicker/insertPicker/deletePicker)', () => {
    it('updatePicker devuelve {error}', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await userServiceRepository.updatePicker('p1', { name: 'Y' })).toEqual({ error: null });
    });

    it('insertPicker propaga error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'dup' } }) as never);
        const res = await userServiceRepository.insertPicker({ id: 'p1' });
        expect(res.error).toMatchObject({ message: 'dup' });
    });

    it('deletePicker devuelve {error:null} en éxito', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await userServiceRepository.deletePicker('p1')).toEqual({ error: null });
    });

    it('insertAttendance devuelve {error}', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await userServiceRepository.insertAttendance({ picker_id: 'p1' })).toEqual({ error: null });
    });
});
