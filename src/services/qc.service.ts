/**
 * qc.service.ts — Quality Control Service
 *
 * Handles picker quality inspections: logging grades (with the six picking
 * criteria and the wellbeing questions), fetching history, and computing
 * grade distributions. Works with the qc_inspections table.
 */
import { logger } from '@/utils/logger';
import { syncService } from './sync.service';
import type { QCInspectionPayload } from './sync-processors/types';
import { todayNZST, nzMidnight, nzEndOfDay } from '@/utils/nzst';
import { qcRepository } from '@/repositories/qc.repository';
import { distributionOf } from './qcDistribution';
import { QcInspectionInsertSchema, safeParse } from '@/schemas/zod.schemas';
import type { QcCriteria, QcGrade } from './qcCriteria';

export interface QCInspection {
    id: string;
    orchard_id: string;
    picker_id: string;
    picker_name?: string;
    inspector_id: string;
    grade: QcGrade;
    notes?: string | null;
    photo_url?: string | null;
    created_at: string;
    /** Criterios marcados; null/undefined en inspecciones solo con nota */
    criteria?: QcCriteria | null;
    /** 0-100 calculado de los criterios */
    score?: number | null;
    /** Fila donde estaba la persona al inspeccionarla */
    row_number?: number | null;
    /** Bienestar (aparte de la nota): ¿sabe qué y cómo recoge? null = sin respuesta */
    informed?: boolean | null;
    /** Bienestar: ¿está a gusto en el equipo? null = sin respuesta */
    comfortable?: boolean | null;
    wellbeing_notes?: string | null;
}

export interface GradeDistribution {
    A: number;
    B: number;
    C: number;
    reject: number;
    total: number;
}

/** Datos de la inspección además de la nota (todos opcionales) */
export interface InspectionDetails {
    criteria?: QcCriteria | null;
    score?: number | null;
    rowNumber?: number | null;
    informed?: boolean | null;
    comfortable?: boolean | null;
    wellbeingNotes?: string | null;
}

export const qcService = {
    /**
     * Log a new quality inspection
     */
    async logInspection(params: {
        orchardId: string;
        pickerId: string;
        inspectorId: string;
        grade: QcGrade;
        notes?: string;
        photoUrl?: string;
    } & InspectionDetails): Promise<QCInspection | null> {
        const candidate: QCInspectionPayload = {
            orchard_id: params.orchardId,
            picker_id: params.pickerId,
            inspector_id: params.inspectorId,
            grade: params.grade,
            notes: params.notes || null,
            photo_url: params.photoUrl || null,
            criteria: params.criteria ?? null,
            score: params.score ?? null,
            row_number: params.rowNumber ?? null,
            informed: params.informed ?? null,
            comfortable: params.comfortable ?? null,
            wellbeing_notes: params.wellbeingNotes?.trim() || null,
        };

        const checked = safeParse(QcInspectionInsertSchema, candidate);
        if (!checked.success) {
            logger.error('[QCService] Invalid inspection:', checked.error);
            return null;
        }
        const payload: QCInspectionPayload = checked.data;

        const { data, error } = await qcRepository.insert(payload);

        if (error) {
            // 🔧 L31: Queue offline instead of silently dropping the inspection
            if (error.message?.includes('Failed to fetch') || error.message?.includes('Network') || !navigator.onLine) {
                await syncService.addToQueue('QC_INSPECTION', payload);
                logger.warn('[QCService] Inspection queued for offline sync');
                // id propio por inspección: varias en cola no pueden compartir clave en la lista
                return { ...payload, id: `pending-${crypto.randomUUID()}`, created_at: new Date().toISOString() } as QCInspection;
            }
            logger.error('[QCService] Failed to log inspection:', error.message);
            return null;
        }

        return data as QCInspection;
    },

    /**
     * Get inspections for a specific orchard and date
     */
    async getInspections(
        orchardId: string,
        date?: string
    ): Promise<QCInspection[]> {
        // 🔧 L31: Use NZST for date boundaries (prevents missing morning inspections)
        const targetDate = date || todayNZST();
        // Día NZ real, sea cual sea la zona horaria del móvil
        const startISO = nzMidnight(targetDate);
        const endISO = nzEndOfDay(targetDate);

        try {
            const data = await qcRepository.getByOrchardAndDateRange(orchardId, startISO, endISO);
            return (data || []) as QCInspection[];
        } catch (error) {
            logger.error('[QCService] Failed to fetch inspections:', (error as Error).message);
            return [];
        }
    },

    /**
     * Get grade distribution for today
     */
    async getGradeDistribution(
        orchardId: string,
        date?: string
    ): Promise<GradeDistribution> {
        return distributionOf(await this.getInspections(orchardId, date));
    },

    /**
     * Get inspections for a specific picker
     */
    async getPickerInspections(
        pickerId: string,
        limit = 20
    ): Promise<QCInspection[]> {
        try {
            const data = await qcRepository.getByPicker(pickerId, limit);
            return (data || []) as QCInspection[];
        } catch (error) {
            logger.error('[QCService] Failed to fetch picker inspections:', (error as Error).message);
            return [];
        }
    },
};
