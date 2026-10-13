import { withOptimisticLock } from '../optimistic-lock.service';
import { nowNZST } from '@/utils/nzst';
import type { TransportPayload } from './types';
import { transportRequestRepo } from '@/repositories/index';

/**
 * Process transport request sync items — create, assign, or complete.
 * Supports optimistic locking on assign/complete when updated_at is available.
 */
export async function processTransport(payload: TransportPayload, expectedUpdatedAt?: string): Promise<void> {
    if (payload.action === 'create') {
        const { error } = await transportRequestRepo.create({
            orchard_id: payload.orchard_id!,
            requested_by: payload.requested_by!,
            requester_name: payload.requester_name || 'Unknown',
            zone: payload.zone!,
            bins_count: payload.bins_count || 1,
            priority: (payload.priority || 'normal') as 'normal' | 'high' | 'urgent',
            notes: payload.notes || null,
        });
        // Sin esto el fallo se perdía y la cola lo daba por subido
        if (error) throw new Error(`Transport request not saved: ${error}`);
    } else if (payload.action === 'assign' && payload.requestId) {
        const updates = {
            assigned_vehicle: payload.vehicleId,
            assigned_by: payload.assignedBy,
            status: 'assigned' as const,
        };
        await updateRequest(payload.requestId, updates, expectedUpdatedAt);
    } else if ((payload.action === 'complete' || payload.action === 'cancel') && payload.requestId) {
        // Cancelar no es completar: queda como cancelado y sin hora de fin
        const updates = payload.action === 'cancel'
            ? { status: 'cancelled' as const }
            : { status: 'completed' as const, completed_at: nowNZST() };
        await updateRequest(payload.requestId, updates, expectedUpdatedAt);
    }
}

/** Actualiza una solicitud: con bloqueo optimista si se conoce su updated_at */
async function updateRequest(
    requestId: string,
    updates: Record<string, unknown>,
    expectedUpdatedAt?: string,
): Promise<void> {
    if (expectedUpdatedAt) {
        const result = await withOptimisticLock({
            table: 'transport_requests',
            recordId: requestId,
            expectedUpdatedAt,
            updates,
        });
        if (!result.success) {
            throw new Error(`Optimistic lock conflict on transport ${requestId}`);
        }
    } else {
        const { error } = await transportRequestRepo.update(requestId, updates);
        if (error) throw new Error(`Transport ${requestId} not updated: ${error}`);
    }
}
