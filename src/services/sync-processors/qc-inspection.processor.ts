import { qcRepository } from '@/repositories/qc.repository';
import { QcInspectionInsertSchema, safeParse } from '@/schemas/zod.schemas';
import type { QCInspectionPayload } from './types';

/**
 * Procesa items de sync tipo QC_INSPECTION — inserta inspecciones en Supabase.
 * Los campos nuevos (criterios, puntuación, fila, bienestar) van a null cuando
 * la inspección se encoló solo con nota (formato anterior).
 */
export async function processQCInspection(payload: QCInspectionPayload): Promise<void> {
  const row = {
    orchard_id: payload.orchard_id,
    picker_id: payload.picker_id,
    inspector_id: payload.inspector_id,
    grade: payload.grade,
    notes: payload.notes || null,
    photo_url: payload.photo_url || null,
    criteria: payload.criteria ?? null,
    score: payload.score ?? null,
    row_number: payload.row_number ?? null,
    informed: payload.informed ?? null,
    comfortable: payload.comfortable ?? null,
    wellbeing_notes: payload.wellbeing_notes || null,
  };

  // Un payload corrupto nunca va a entrar en la tabla: mejor un error claro
  // (acaba en la cola de fallidos) que reintentar contra el CHECK de la BD.
  const checked = safeParse(QcInspectionInsertSchema, row);
  if (!checked.success) {
    throw new Error(`Invalid QC inspection payload: ${checked.error}`);
  }

  const { error } = await qcRepository.insert(checked.data);

  if (error) {
    throw new Error(`Failed to sync QC inspection: ${error.message}`);
  }
}
