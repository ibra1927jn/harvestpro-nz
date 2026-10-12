/**
 * rowSlice — Structure and updater logic tests
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/utils/uuid', () => ({ safeUUID: () => 'row-uuid-1' }));

import { createRowSlice } from './rowSlice';
import { rowRepository } from '@/repositories/row.repository';
import { beforeEach } from 'vitest';

// El store ya cargó el repositorio real (test-setup), así que se espían sus métodos
beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(rowRepository, 'updatePickerRows').mockResolvedValue({ error: null } as never);
    vi.spyOn(rowRepository, 'upsertRowAssignments').mockResolvedValue({ error: null } as never);
    vi.spyOn(rowRepository, 'retireAssignments').mockResolvedValue({ error: null } as never);
    vi.spyOn(rowRepository, 'updateProgress').mockResolvedValue(undefined as never);
    vi.spyOn(rowRepository, 'completeRow').mockResolvedValue(undefined as never);
});

function makeSlice(initial: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = {
        rowAssignments: [],
        crew: [
            { id: 'p1', name: 'Alice', current_row: 0 },
            { id: 'p2', name: 'Bob', current_row: 0 },
        ],
        orchard: { id: 'o1' },
        ...initial,
    };
    const setSpy = vi.fn();
    const slice = createRowSlice(setSpy as never, (() => store) as never, {} as never);
    return { slice, store, setSpy };
}

describe('rowSlice', () => {
    it('initial state: empty rowAssignments', () => {
        const { slice } = makeSlice();
        expect(slice.rowAssignments).toEqual([]);
    });

    it('exposes 4 methods', () => {
        const { slice } = makeSlice();
        ['assignRows', 'assignRow', 'updateRowProgress', 'completeRow'].forEach(m =>
            expect(typeof (slice as Record<string, unknown>)[m]).toBe('function')
        );
    });

    it('assignRows passes set() updater that creates entries + updates crew', () => {
        const { slice, setSpy } = makeSlice();
        slice.assignRows([5, 6], 'north', ['p1', 'p2']);
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({
            rowAssignments: [],
            crew: [{ id: 'p1', current_row: 0 }, { id: 'p2', current_row: 0 }],
        });
        const ra = result.rowAssignments as Array<{ row_number: number; assigned_pickers: string[] }>;
        expect(ra.length).toBe(2);
        expect(ra[0].row_number).toBe(5);
        expect(ra[0].assigned_pickers).toEqual(['p1', 'p2']);
        // crew current_row updated to first row
        const crew = result.crew as Array<{ id: string; current_row: number }>;
        expect(crew.find(p => p.id === 'p1')?.current_row).toBe(5);
    });

    it('assignRows removes old assignments for same pickers', () => {
        const { slice, setSpy } = makeSlice();
        slice.assignRows([10], 'south', ['p1']);
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({
            rowAssignments: [
                { id: 'old', row_number: 1, assigned_pickers: ['p1'], completion_percentage: 50 },
                { id: 'keep', row_number: 99, assigned_pickers: ['p3'], completion_percentage: 0 },
            ],
            crew: [{ id: 'p1', current_row: 0 }],
        });
        const ra = result.rowAssignments as Array<{ row_number: number }>;
        expect(ra.find(a => a.row_number === 1)).toBeUndefined();
        expect(ra.find(a => a.row_number === 99)).toBeDefined();
        expect(ra.find(a => a.row_number === 10)).toBeDefined();
    });

    it('assignRows skips without orchard', () => {
        const { slice, setSpy } = makeSlice({ orchard: null });
        slice.assignRows([5], 'north', ['p1']);
        expect(setSpy).not.toHaveBeenCalled();
    });

    it('assignRows skips empty rows', () => {
        const { slice, setSpy } = makeSlice();
        slice.assignRows([], 'north', ['p1']);
        expect(setSpy).not.toHaveBeenCalled();
    });

    it('updateRowProgress passes set() updater that maps by id', () => {
        const { slice, setSpy } = makeSlice();
        slice.updateRowProgress('r1', 75);
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({
            rowAssignments: [
                { id: 'r1', completion_percentage: 30 },
                { id: 'r2', completion_percentage: 50 },
            ],
        });
        const ra = result.rowAssignments as Array<{ id: string; completion_percentage: number }>;
        expect(ra.find(r => r.id === 'r1')?.completion_percentage).toBe(75);
        expect(ra.find(r => r.id === 'r2')?.completion_percentage).toBe(50); // unchanged
    });

    it('completeRow passes set() updater that sets 100%', () => {
        const { slice, setSpy } = makeSlice();
        slice.completeRow('r1');
        expect(setSpy).toHaveBeenCalled();
        const updater = setSpy.mock.calls[0][0] as (state: Record<string, unknown>) => Record<string, unknown>;
        const result = updater({
            rowAssignments: [{ id: 'r1', completion_percentage: 60 }],
        });
        expect((result.rowAssignments as Array<{ completion_percentage: number }>)[0].completion_percentage).toBe(100);
    });

    it('assignRows undoes the change and throws when the server rejects it', async () => {
        vi.spyOn(rowRepository, 'upsertRowAssignments')
            .mockResolvedValueOnce({ error: { message: 'permission denied' } } as never);
        const { slice, setSpy } = makeSlice();
        await expect(slice.assignRows([5], 'north', ['p1'])).rejects.toThrow(/not saved/);
        // último set() = estado anterior restaurado
        const last = setSpy.mock.calls[setSpy.mock.calls.length - 1][0];
        expect(last.rowAssignments).toEqual([]);
    });

    it('assignRows retires the team\'s previous server assignments', async () => {
        const oldId = '11111111-1111-4111-8111-111111111111';
        const { slice } = makeSlice({
            rowAssignments: [
                { id: oldId, row_number: 2, side: 'north', assigned_pickers: ['p1'], completion_percentage: 0 },
                { id: 'rebuilt-3-p1', row_number: 3, side: 'north', assigned_pickers: ['p1'], completion_percentage: 0 },
            ],
        });
        await slice.assignRows([5], 'north', ['p1']);
        expect(rowRepository.retireAssignments).toHaveBeenCalledWith([oldId]);
    });
});
