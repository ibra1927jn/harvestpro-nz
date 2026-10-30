import { leaveRepository } from '@/repositories/leave.repository';
import type { LeaveRequestPayload } from './types';

/**
 * Procesa items de sync tipo LEAVE_REQUEST: la ausencia que el team leader
 * pidió sin red llega a leave_requests como «requested» (RRHH la ve en su Agenda).
 * La validación la hace el despachador con LeaveRequestPayloadSchema (sync.schemas.ts):
 * no importar zod aquí (bundle inicial).
 */
export async function processLeaveRequest(payload: LeaveRequestPayload): Promise<void> {
  try {
    await leaveRepository.insert({ ...payload, status: 'requested' });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // Ya se guardó en un intento anterior cuya respuesta no llegó
    if (err?.code === '23505' || /duplicate key/i.test(err?.message ?? '')) return;
    throw new Error(`Leave request not saved: ${err?.message ?? String(e)}`);
  }
}
