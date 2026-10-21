import { qcRepository } from '@/repositories/qc.repository';
import type { QCInspectionPayload } from './types';

/**
 * Procesa items de sync tipo QC_INSPECTION — inserta inspecciones en Supabase.
 * Los campos nuevos (criterios, puntuación, fila, bienestar) van a null cuando
 * la inspección se encoló solo con nota (formato anterior).
 *
 * La validación del payload la hace el despachador de la cola con
 * QCInspectionPayloadSchema (sync.schemas.ts, cargado con import()): no
 * importar zod aquí, este módulo va en el bundle inicial (login / runner).
 */
export async function processQCInspection(payload: QCInspectionPayload): Promise<void> {
  const { error } = await qcRepository.insert({
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
  });

  if (error) {
    throw new Error(`Failed to sync QC inspection: ${error.message}`);
  }
}
