/**
 * blockRowNumbers y sus consumidores: un bloque con huecos (dos rangos o una
 * fila archivada) enseña sus filas reales, no start..start+total-1.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { blockRowNumbers } from './blockRows';
import { useOrchardMap } from '@/hooks/useOrchardMap';
import { useHarvestStore } from '@/stores/useHarvestStore';
import type { OrchardBlock } from '@/types';

// Filas 1–3 y 10–11 (la 2 archivada): start_row 1, total_rows 4
const gappy: OrchardBlock = {
    id: 'b1', name: 'Block A', startRow: 1, totalRows: 4, colorCode: '#000', status: 'idle' as OrchardBlock['status'],
    rowVarieties: { 1: 'Gala', 3: 'Gala', 10: 'Fuji', 11: 'Fuji' },
};

describe('blockRowNumbers', () => {
    it('uses the real rows, in order', () => {
        expect(blockRowNumbers(gappy)).toEqual([1, 3, 10, 11]);
    });
    it('falls back to the range when the block carries no rows', () => {
        expect(blockRowNumbers({ startRow: 16, totalRows: 3, rowVarieties: {} })).toEqual([16, 17, 18]);
        expect(blockRowNumbers({ startRow: 5, totalRows: 0, rowVarieties: {} })).toEqual([]);
    });
});

describe('useOrchardMap with a block that has gaps', () => {
    beforeEach(() => {
        act(() => useHarvestStore.setState({
            orchardBlocks: [gappy], selectedBlockId: 'b1', rowTargets: { 10: 1 }, rowAssignments: [],
        }));
    });

    it('row data lists the real rows (not 1–4) with their varieties', () => {
        const { result } = renderHook(() => useOrchardMap([], [], 5));
        expect(result.current.rowData.map(r => [r.rowNum, r.variety])).toEqual([[1, 'Gala'], [3, 'Gala'], [10, 'Fuji'], [11, 'Fuji']]);
    });

    it('block stats count buckets of the real rows and progress over the real count', () => {
        const buckets = [
            { id: 'x1', row_number: 10, quality_grade: 'A' },
            { id: 'x2', row_number: 2, quality_grade: 'A' }, // fila archivada: no es del bloque
        ] as unknown as Parameters<typeof useOrchardMap>[1];
        const { result } = renderHook(() => useOrchardMap([], buckets, 5));
        expect(result.current.blockStats.b1).toMatchObject({ buckets: 1, completedRows: 1, progress: 0.25 });
    });
});
