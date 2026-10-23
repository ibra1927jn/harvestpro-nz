import { qcRepository } from '@/repositories/qc.repository';
import { pendingFiles } from '../pending-files.service';
import { logger } from '@/utils/logger';
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
  // Foto hecha sin cobertura: primero se sube (si falla, la inspección espera)
  let photoUrl = payload.photo_url || null;
  if (payload.photo_file_id && payload.photo_path) {
    const blob = await pendingFiles.get(payload.photo_file_id);
    if (blob) {
      photoUrl = await qcRepository.uploadPhoto(payload.photo_path, blob);
    } else {
      // Se borraron los datos de la app: la inspección vale igual, sin foto
      logger.warn('[QC sync] Photo no longer on this device; saving the inspection without it');
    }
  }

  const { error } = await qcRepository.insert({
    ...(payload.id ? { id: payload.id } : {}),
    orchard_id: payload.orchard_id,
    picker_id: payload.picker_id,
    inspector_id: payload.inspector_id,
    grade: payload.grade,
    notes: payload.notes || null,
    photo_url: photoUrl,
    criteria: payload.criteria ?? null,
    score: payload.score ?? null,
    row_number: payload.row_number ?? null,
    informed: payload.informed ?? null,
    comfortable: payload.comfortable ?? null,
    wellbeing_notes: payload.wellbeing_notes || null,
  });

  // Ya guardada en un intento anterior cuya respuesta no llegó (mismo id)
  const duplicate = !!error && payload.id && (error as { code?: string }).code === '23505';
  if (error && !duplicate) {
    throw new Error(`Failed to sync QC inspection: ${error.message}`);
  }
  if (payload.photo_file_id) await pendingFiles.delete(payload.photo_file_id);
}
