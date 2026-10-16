/**
 * Número de arnés: en la app es `harness_id`, en la BD `pickers.harness_number`.
 * Antes la columna no existía y el número se perdía sin aviso
 * (auditoría 2026-10-16, hallazgo 15).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickerService } from '../picker.service';
import { pickerCrudRepository } from '@/repositories/picker-crud.repository';
import { pickerRepository } from '@/repositories/picker.repository';
import { processPicker } from '../sync-processors/picker.processor';

describe('harness number ↔ pickers.harness_number', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the harness number from its own column, not from the picker ID', async () => {
        vi.spyOn(pickerCrudRepository, 'query').mockResolvedValue([
            { id: 'p1', picker_id: 'PK001', name: 'Alice', status: 'active', safety_verified: true, current_row: 1, harness_number: 'H-17' },
            { id: 'p2', picker_id: 'PK002', name: 'Bob', status: 'active', safety_verified: true, current_row: 1, harness_number: null },
        ] as never);
        vi.spyOn(pickerRepository, 'getPerformanceToday').mockResolvedValue([] as never);

        const crew = await pickerService.getPickersByTeam('tl-1');

        expect(crew.find(p => p.id === 'p1')?.harness_id).toBe('H-17');
        expect(crew.find(p => p.id === 'p2')?.harness_id).toBeUndefined();
    });

    it('saves an edited harness number as harness_number', async () => {
        const updateSpy = vi.spyOn(pickerCrudRepository, 'updateById').mockResolvedValue(undefined);

        await pickerService.updatePicker('p1', { harness_id: 'H-22' });

        expect(updateSpy).toHaveBeenCalledWith('p1', { harness_number: 'H-22' });
    });

    it('clearing the harness number stores null', async () => {
        const updateSpy = vi.spyOn(pickerCrudRepository, 'updateById').mockResolvedValue(undefined);

        await pickerService.updatePicker('p1', { harness_id: '' });

        expect(updateSpy).toHaveBeenCalledWith('p1', { harness_number: null });
    });

    it('a picker created offline keeps the harness number when it syncs', async () => {
        vi.spyOn(pickerCrudRepository, 'query').mockResolvedValue([] as never);
        const insertSpy = vi.spyOn(pickerCrudRepository, 'insert').mockResolvedValue({ id: 'p9' } as never);

        await processPicker({ id: 'p9', picker_id: 'PK009', name: 'Cara', orchard_id: 'o1', harness_id: 'H-09' });

        expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ harness_number: 'H-09' }));
    });
});
