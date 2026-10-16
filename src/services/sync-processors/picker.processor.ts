import { pickerCrudRepository } from '@/repositories/picker-crud.repository';
import type { PickerPayload } from './types';

/**
 * Procesa items de sync tipo PICKER — crea o actualiza pickers en Supabase.
 */
export async function processPicker(payload: PickerPayload): Promise<void> {
  const { id, picker_id, name, orchard_id, status, role, team_leader_id, harness_id } = payload;

  const existing = await pickerCrudRepository.query(undefined, orchard_id);
  const match = existing.find((p: Record<string, unknown>) => p.id === id || p.picker_id === picker_id);

  if (match) {
    const updates: Record<string, unknown> = { name, orchard_id };
    if (status !== undefined) updates.status = status;
    if (role !== undefined) updates.role = role;
    if (team_leader_id !== undefined) updates.team_leader_id = team_leader_id;
    if (harness_id !== undefined) updates.harness_number = harness_id || null;
    await pickerCrudRepository.updateById(match.id as string, updates);
  } else {
    await pickerCrudRepository.insert({
      id,
      picker_id,
      name,
      orchard_id,
      status: status || 'active',
      role: role || 'picker',
      team_leader_id: team_leader_id || null,
      harness_number: harness_id || null,
    });
  }
}
