import { withOptimisticLock } from '../optimistic-lock.service';
import type { ContractPayload } from './types';
import { contractRepo } from '@/repositories/index';
import { MINIMUM_WAGE } from '@/types';

/**
 * Process contract sync items — create or update contracts in Supabase.
 * Supports optimistic locking on updates when updated_at is available.
 */
export async function processContract(
  payload: ContractPayload,
  expectedUpdatedAt?: string
): Promise<void> {
  if (payload.action === 'create') {
    const { error } = await contractRepo.create({
      employee_id: payload.employee_id!,
      orchard_id: payload.orchard_id!,
      type: payload.type as 'permanent' | 'seasonal' | 'casual',
      start_date: payload.start_date!,
      end_date: payload.end_date || null,
      hourly_rate: payload.hourly_rate || MINIMUM_WAGE,
      notes: payload.notes || null,
    });
    if (error) throw new Error(`Contract not saved: ${error}`);
  } else if (payload.action === 'update' && payload.contractId) {
    const updates: Record<string, unknown> = {};
    if (payload.status !== undefined) updates.status = payload.status;
    if (payload.end_date !== undefined) updates.end_date = payload.end_date;
    if (payload.hourly_rate !== undefined) updates.hourly_rate = payload.hourly_rate;
    if (payload.notes !== undefined) updates.notes = payload.notes;

    if (expectedUpdatedAt) {
      const result = await withOptimisticLock({
        table: 'contracts',
        recordId: payload.contractId,
        expectedUpdatedAt,
        updates,
      });
      if (!result.success) {
        throw new Error(`Optimistic lock conflict on contract ${payload.contractId}`);
      }
    } else {
      const { error } = await contractRepo.update(payload.contractId, updates);
      if (error) throw new Error(`Contract ${payload.contractId} not updated: ${error}`);
    }
  }
}
