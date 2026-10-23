import { Picker } from '../types';
import { withOptimisticLock } from './optimistic-lock.service';
import { logger } from '@/utils/logger';
import { PickerSchema, safeParseArray } from '@/schemas/zod.schemas';
import { pickerCrudRepository } from '@/repositories/picker-crud.repository';

export const pickerService = {
    async getPickersByTeam(teamLeaderId?: string, orchardId?: string): Promise<Picker[]> {
        // Sin pickers_performance_today: la vista filtraba users.role='picker' (no
        // existe) y devolvía siempre 0, y se pedía en cada pase de lista junto a un
        // count de diagnóstico (auditoría 2026-10-23, punto 7). Las cubetas de hoy
        // las calcula el store con bucket_records.
        const data = await pickerCrudRepository.query(teamLeaderId, orchardId);

        // Plantilla: los archivados no se pueden fichar (antes fichar los reactivaba)
        const validPickers = safeParseArray(PickerSchema, data || [])
            .filter(p => p.status !== 'archived' && p.id !== teamLeaderId);
        return validPickers.map((p) => {
            return {
                id: p.id,
                picker_id: p.picker_id || p.id,
                name: p.name || 'Unknown',
                avatar: (p.name || '??').substring(0, 2).toUpperCase(),
                hours: 0,
                total_buckets_today: 0,
                current_row: p.current_row || 0,
                status: (p.status !== 'archived' && p.status !== 'inactive' ? 'active' : 'inactive') as 'active' | 'break' | 'issue',
                safety_verified: p.safety_verified,
                qcStatus: [1, 1, 1],
                harness_id: p.harness_number || undefined,
                team_leader_id: p.team_leader_id || undefined,
                orchard_id: p.orchard_id ?? undefined,
                role: (p.role as Picker['role']) || 'picker'
            };
        });
    },

    async assignRowToPickers(pickerIds: string[], row: number) {
        await pickerCrudRepository.bulkUpdateRow(pickerIds, row);
    },

    async addPicker(picker: Partial<Picker>) {
        return pickerCrudRepository.insert({
            picker_id: picker.picker_id,
            name: picker.name,
            status: 'active',
            safety_verified: picker.safety_verified || false,
            team_leader_id: picker.team_leader_id,
            current_row: 0,
            orchard_id: picker.orchard_id || null,
        });
    },

    async updatePickerStatus(pickerId: string, status: 'active' | 'break' | 'inactive', expectedUpdatedAt?: string) {
        if (expectedUpdatedAt) {
            return withOptimisticLock({
                table: 'pickers',
                recordId: pickerId,
                expectedUpdatedAt,
                updates: { status },
            });
        }
        await pickerCrudRepository.updateById(pickerId, { status });
    },

    async deletePicker(pickerId: string) {
        await pickerCrudRepository.deleteById(pickerId);
    },

    async updatePickerRow(pickerId: string, row: number, expectedUpdatedAt?: string) {
        if (expectedUpdatedAt) {
            return withOptimisticLock({
                table: 'pickers',
                recordId: pickerId,
                expectedUpdatedAt,
                updates: { current_row: row },
            });
        }
        await pickerCrudRepository.updateById(pickerId, { current_row: row });
    },

    async updatePicker(pickerId: string, updates: Partial<Picker>, expectedUpdatedAt?: string) {
        if (updates.picker_id) {
            const duplicate = await pickerCrudRepository.findDuplicate(updates.picker_id, pickerId);
            if (duplicate) {
                throw new Error(`Picker ID ${updates.picker_id} is already assigned to ${duplicate.name}`);
            }
        }

        const dbUpdates: Partial<Picker> = { ...updates };
        delete dbUpdates.id;
        delete dbUpdates.qcStatus;
        delete dbUpdates.harness_id;
        // En la BD el arnés es harness_number (en la app, harness_id)
        if (updates.harness_id !== undefined) {
            (dbUpdates as Record<string, unknown>).harness_number = updates.harness_id || null;
        }

        if (expectedUpdatedAt) {
            return withOptimisticLock({
                table: 'pickers',
                recordId: pickerId,
                expectedUpdatedAt,
                updates: dbUpdates as Record<string, unknown>,
            });
        }

        await pickerCrudRepository.updateById(pickerId, dbUpdates as Record<string, unknown>);
    },

    async addPickersBulk(
        pickers: Array<{ name: string; email?: string; phone?: string; picker_id?: string }>,
        orchardId: string
    ): Promise<{ created: number; skipped: number; errors: string[] }> {
        const BATCH_SIZE = 50;
        let created = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < pickers.length; i += BATCH_SIZE) {
            const batch = pickers.slice(i, i + BATCH_SIZE);

            const rows = batch.map(p => ({
                name: p.name.trim(),
                picker_id: p.picker_id || `P-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                status: 'active' as const,
                safety_verified: false,
                current_row: 0,
                orchard_id: orchardId,
            }));

            try {
                const data = await pickerCrudRepository.insertBatch(rows);
                created += data?.length || batch.length;
            } catch {
                // Batch failed, try individual inserts
                for (const row of rows) {
                    try {
                        const { error: singleError } = await pickerCrudRepository.insertSingle(row);
                        if (singleError) {
                            skipped++;
                            errors.push(`${row.name}: ${singleError.message}`);
                        } else {
                            created++;
                        }
                    } catch (e) {
                        skipped++;
                        const msg = e instanceof Error ? e.message : 'Unknown error';
                        errors.push(`${row.name}: ${msg}`);
                        logger.warn(`[pickerService] Bulk insert failed for ${row.name}:`, e);
                    }
                }
            }
        }

        return { created, skipped, errors };
    },
};

