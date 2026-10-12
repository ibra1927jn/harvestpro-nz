/**
 * useQC — Data loading for the QualityControl page
 *
 * Extracts inspection loading, grade submission, and photo upload logic
 * from QualityControl.tsx following the usePayroll pattern.
 */
import { useState, useCallback } from 'react';
import { qcService, QCInspection, GradeDistribution } from '@/services/qc.service';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { Picker } from '@/types';
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';

type QualityGrade = 'A' | 'B' | 'C' | 'reject';

export interface UseQCResult {
  inspections: QCInspection[];
  distribution: GradeDistribution;
  selectedPicker: Picker | null;
  notes: string;
  isSubmitting: boolean;
  isLoading: boolean;
  lastGrade: { grade: QualityGrade; picker: string } | null;
  gradeError: string | null;
  crew: Picker[];
  orchardId: string | undefined;
  setSelectedPicker: (picker: Picker | null) => void;
  setNotes: (notes: string) => void;
  handleGrade: (grade: QualityGrade, photoBlob?: Blob | null) => Promise<boolean>;
  loadInspections: () => Promise<void>;
}

export function useQC(): UseQCResult {
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

  const loadInspections = useCallback(async () => {
    if (!orchardId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await qcService.getInspections(orchardId);
      setInspections(data);
      const dist = await qcService.getGradeDistribution(orchardId);
      setDistribution(dist);
    } catch (err) {
      logger.warn('[QC] Failed to load inspections:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orchardId]);

  const handleGrade = useCallback(
    async (grade: QualityGrade, photoBlob?: Blob | null): Promise<boolean> => {
      if (!selectedPicker || !orchardId || !appUser?.id) return false;
      setIsSubmitting(true);
      setGradeError(null);

      let photoUrl: string | undefined;

      if (photoBlob) {
        try {
          const dateStr = new Date().toISOString().slice(0, 10);
          const fileName = `${orchardId}/${dateStr}/${crypto.randomUUID()}.webp`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('qc-photos')
            .upload(fileName, photoBlob, {
              contentType: 'image/webp',
              cacheControl: '31536000',
            });

          if (uploadError) {
            logger.error('[QC] Photo upload failed:', uploadError.message);
          } else if (uploadData?.path) {
            const { data: urlData } = supabase.storage
              .from('qc-photos')
              .getPublicUrl(uploadData.path);
            photoUrl = urlData.publicUrl;
          }
        } catch (err) {
          logger.error('[QC] Photo upload error:', err);
        }
      }

      const result = await qcService.logInspection({
        orchardId,
        pickerId: selectedPicker.id,
        inspectorId: appUser.id,
        grade,
        notes: notes.trim() || undefined,
        photoUrl,
      });

      if (result) {
        setLastGrade({ grade, picker: selectedPicker.name });
        setNotes('');
        await loadInspections();
        setTimeout(() => setLastGrade(null), 3000);
      } else {
        // Antes no se avisaba y parecía guardado
        setGradeError(`Inspection for ${selectedPicker.name} was NOT saved. Try again.`);
      }

      setIsSubmitting(false);
      return !!result;
    },
    [selectedPicker, orchardId, appUser?.id, notes, loadInspections]
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
    crew,
    orchardId,
    setSelectedPicker,
    setNotes,
    handleGrade,
    loadInspections,
  };
}
