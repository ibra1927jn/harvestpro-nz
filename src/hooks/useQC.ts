/**
 * useQC — Data loading for the QualityControl page
 *
 * Extracts inspection loading, grade submission, and photo upload logic
 * from QualityControl.tsx following the usePayroll pattern.
 */
import { announce } from '@/services/announcer';
import { useState, useCallback, useEffect } from 'react';
import { qcService, QCInspection, GradeDistribution, InspectionDetails } from '@/services/qc.service';
import { distributionOf } from '@/services/qcDistribution';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { Picker } from '@/types';
import { logger } from '@/utils/logger';
import { qcRepository } from '@/repositories/qc.repository';
import { pendingFiles } from '@/services/pending-files.service';
import { useTranslation } from '@/i18n';
import { gradeLongLabel } from '@/components/views/qc/gradeLabel';
import { todayNZST } from '@/utils/nzst';
import { Role } from '@/types';

type QualityGrade = 'A' | 'B' | 'C' | 'reject';

/** Quién ve las respuestas de bienestar (informado / a gusto): nunca el perfil público */
const WELLBEING_ROLES: ReadonlySet<string> = new Set([Role.TEAM_LEADER, Role.MANAGER, Role.HR_ADMIN, Role.ADMIN]);

export interface UseQCResult {
  inspections: QCInspection[];
  distribution: GradeDistribution;
  selectedPicker: Picker | null;
  notes: string;
  isSubmitting: boolean;
  isLoading: boolean;
  lastGrade: { grade: QualityGrade; picker: string } | null;
  gradeError: string | null;
  /** Aviso si la foto se perdió (no cabía en el móvil sin cobertura) */
  photoWarning: string | null;
  crew: Picker[];
  orchardId: string | undefined;
  /** El usuario puede ver las respuestas de bienestar de las inspecciones */
  canViewWellbeing: boolean;
  setSelectedPicker: (picker: Picker | null) => void;
  setNotes: (notes: string) => void;
  /** Guarda la inspección: nota + (opcional) criterios, puntuación, fila y bienestar */
  handleGrade: (grade: QualityGrade, photoBlob?: Blob | null, details?: InspectionDetails) => Promise<boolean>;
  loadInspections: () => Promise<void>;
}

export function useQC(): UseQCResult {
  const { t } = useTranslation();
  const { crew, orchard } = useHarvestStore();
  const { appUser } = useAuth();
  const orchardId = orchard?.id;

  const [inspections, setInspections] = useState<QCInspection[]>([]);
  const [distribution, setDistribution] = useState<GradeDistribution>({
    A: 0,
    B: 0,
    C: 0,
    reject: 0,
    total: 0,
  });
  const [selectedPicker, setSelectedPicker] = useState<Picker | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastGrade, setLastGrade] = useState<{ grade: QualityGrade; picker: string } | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  /** La foto no se pudo subir ni guardar en el móvil (la inspección sí se guardó) */
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  const loadInspections = useCallback(async () => {
    if (!orchardId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Una consulta: el reparto sale de las mismas inspecciones (antes se pedían dos veces)
      const data = await qcService.getInspections(orchardId);
      setInspections(data);
    } catch (err) {
      logger.warn('[QC] Failed to load inspections:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orchardId]);

  // El reparto de notas siempre sale de la lista que hay en pantalla
  useEffect(() => {
    setDistribution(distributionOf(inspections));
  }, [inspections]);

  const handleGrade = useCallback(
    async (grade: QualityGrade, photoBlob?: Blob | null, details?: InspectionDetails): Promise<boolean> => {
      if (!selectedPicker || !orchardId || !appUser?.id) return false;
      setIsSubmitting(true);
      setGradeError(null);
      setPhotoWarning(null);

      // id del móvil: la foto se llama igual y la cola puede reintentar sin duplicar
      const inspectionId = crypto.randomUUID();
      let photoUrl: string | undefined;
      let pendingPhoto: { fileId: string; path: string } | undefined;

      if (photoBlob) {
        const path = `${orchardId}/${todayNZST()}/${inspectionId}.webp`;
        try {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch (offline)');
          // Bucket privado: se guarda la ruta; se muestra con enlace firmado (useQcPhotoUrl)
          photoUrl = await qcRepository.uploadPhoto(path, photoBlob);
        } catch (err) {
          // Sin cobertura (o fallo al subir): la foto espera cifrada en el móvil
          // con la inspección y la cola la sube al volver la red
          logger.warn('[QC] Photo not uploaded now, keeping it on the phone:', err);
          try {
            await pendingFiles.put(inspectionId, 'qc', photoBlob, 'image/webp');
            pendingPhoto = { fileId: inspectionId, path };
          } catch (storeErr) {
            logger.error('[QC] Photo could not be kept on this phone:', storeErr);
            setPhotoWarning(t('qc.photo_not_kept'));
          }
        }
      }

      const result = await qcService.logInspection({
        id: inspectionId,
        ...(pendingPhoto ? { pendingPhoto } : {}),
        orchardId,
        pickerId: selectedPicker.id,
        inspectorId: appUser.id,
        grade,
        notes: notes.trim() || undefined,
        photoUrl,
        ...details,
        // La fila es la del picker en ese momento, salvo que la pantalla diga otra
        rowNumber: details?.rowNumber ?? (selectedPicker.current_row > 0 ? selectedPicker.current_row : null),
      });

      if (result) {
        setLastGrade({ grade, picker: selectedPicker.name });
        announce(t('qc.sr_logged', { grade: gradeLongLabel(t, grade), name: selectedPicker.name }));
        setNotes('');
        // Se añade la inspección guardada sin volver a bajar todas las del día
        // (antes, cada nota recargaba la lista dos veces)
        setInspections(prev => [result, ...prev.filter(i => i.id !== result.id)]);
        setTimeout(() => setLastGrade(null), 3000);
      } else {
        // Antes no se avisaba y parecía guardado
        const msg = t('qc.not_saved', { name: selectedPicker.name });
        setGradeError(msg);
        announce(msg, 'assertive');
      }

      setIsSubmitting(false);
      return !!result;
    },
    [selectedPicker, orchardId, appUser?.id, notes, t]
  );

  return {
    inspections,
    distribution,
    selectedPicker,
    notes,
    isSubmitting,
    isLoading,
    lastGrade,
    gradeError,
    photoWarning,
    crew,
    orchardId,
    canViewWellbeing: !!appUser?.role && WELLBEING_ROLES.has(appUser.role),
    setSelectedPicker,
    setNotes,
    handleGrade,
    loadInspections,
  };
}
