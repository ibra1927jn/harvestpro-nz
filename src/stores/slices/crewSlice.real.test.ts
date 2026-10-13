/**
 * crewSlice — Structure and updater logic tests
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/sync.service', () => ({
    syncService: { addToQueue: vi.fn().mockResolvedValue('q') },
}));
vi.mock('@/services/audit.service', () => ({
    auditService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { createCrewSlice } from './crewSlice';
import { pickerCrudRepository } from '@/repositories/picker-crud.repository';
import { beforeEach } from 'vitest';

// Se espían los métodos del repositorio real
beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pickerCrudRepository, 'insert').mockResolvedValue({} as never);
    vi.spyOn(pickerCrudRepository, 'updateById').mockResolvedValue({} as never);
});

function makeSlice(initial: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = {
        crew: [], presentCount: 0,
        orchard: { id: 'o1', name: 'Test' },
        currentUser: { id: 'u1', name: 'Mgr', role: 'manager' },
        ...initial,
    };
    const setSpy = vi.fn();
    const slice = createCrewSlice(setSpy as never, (() => store) as never, {} as never);
    return { slice, store, setSpy };
}

describe('crewSlice', () => {
    it('initial state: crew=[], presentCount=0', () => {
        const { slice } = makeSlice();
        expect(slice.crew).toEqual([]);
        expect(slice.presentCount).toBe(0);
    });

    it('exposes 4 CRUD methods', () => {
        const { slice } = makeSlice();
        ['addPicker', 'removePicker', 'updatePicker', 'unassignUser'].forEach(m =>
            expect(typeof (slice as unknown as Record<string, unknown>)[m]).toBe('function')
        );
    });

    it('addPicker passes set() an updater that appends picker with UUID', () => {
        const { slice, setSpy } = makeSlice();
        // Don't await — just trigger the synchronous set() call
        slice.addPicker({ name: 'Alice', status: 'active' });
        // First set() call is the optimistic add
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({ crew: [] });
        const newCrew = result.crew as Array<{ name: string; id: string; orchard_id: string }>;
        expect(newCrew.length).toBe(1);
        expect(newCrew[0].name).toBe('Alice');
        expect(typeof newCrew[0].id).toBe('string');
        expect(newCrew[0].id.length).toBeGreaterThan(0);
        expect(newCrew[0].orchard_id).toBe('o1');
    });

    it('addPicker sets default role=picker and safety_verified=false', () => {
        const { slice, setSpy } = makeSlice();
        slice.addPicker({ name: 'New' });
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({ crew: [] });
        const picker = (result.crew as Array<Record<string, unknown>>)[0];
        expect(picker.role).toBe('picker');
        expect(picker.safety_verified).toBe(false);
    });

    it('addPicker does nothing without orchard', () => {
        const { slice, setSpy } = makeSlice({ orchard: null });
        slice.addPicker({ name: 'X' });
        expect(setSpy).not.toHaveBeenCalled();
    });

    it('removePicker passes set() an updater that filters by id', () => {
        const { slice, setSpy } = makeSlice({ crew: [{ id: 'p1', name: 'Alice' }] });
        slice.removePicker('p1');
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({ crew: [{ id: 'p1' }, { id: 'p2' }] });
        expect((result.crew as unknown[]).length).toBe(1);
       expect((result.crew as Array<{ id: string }>)[0].id).toBe('p2');
    });

    it('updatePicker passes set() an updater that maps by id', () => {
        const { slice, setSpy } = makeSlice({ crew: [{ id: 'p1', name: 'Old' }] });
        slice.updatePicker('p1', { name: 'New' });
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({ crew: [{ id: 'p1', name: 'Old', status: 'active' }] });
        const updated = (result.crew as Array<{ name: string; status: string }>)[0];
        expect(updated.name).toBe('New');
        expect(updated.status).toBe('active'); // unchanged
    });

    it('unassignUser passes set() an updater that filters by id', () => {
        const { slice, setSpy } = makeSlice({ crew: [{ id: 'p1' }] });
        slice.unassignUser('p1');
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({ crew: [{ id: 'p1' }, { id: 'p2' }] });
        expect((result.crew as unknown[]).length).toBe(1);
    });

    it('addPicker sends only real pickers columns and reports DB errors', async () => {
        const insert = vi.spyOn(pickerCrudRepository, 'insert').mockResolvedValue({} as never);
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
        const { slice } = makeSlice();

        await slice.addPicker({ name: 'Alice', picker_id: 'LOC-900' });
        const row = insert.mock.calls[insert.mock.calls.length - 1][0];
        expect(Object.keys(row).sort()).toEqual(
            ['current_row', 'id', 'name', 'orchard_id', 'picker_id', 'role', 'safety_verified', 'status', 'team_leader_id']
        );

        insert.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value' });
        await expect(slice.addPicker({ name: 'Bob', picker_id: 'LOC-900' })).rejects.toThrow(/already used/);
    });
});
