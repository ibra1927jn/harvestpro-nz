/**
 * qc.service.ts — Quality Control Service
 * 
 * Handles fruit quality inspections: logging grades, fetching history,
 * and computing grade distributions. Works with the qc_inspections table.
 */
import { logger } from '@/utils/logger';
import { syncService } from './sync.service';
import type { QCInspectionPayload } from './sync-processors/types';
import { todayNZST, nzMidnight, nzEndOfDay } from '@/utils/nzst';
import { qcRepository } from '@/repositories/qc.repository';
import { distributionOf } from './qcDistribution';

export interface QCInspection {
    id: string;
    orchard_id: string;
    picker_id: string;
    picker_name?: string;
    inspector_id: string;
    grade: 'A' | 'B' | 'C' | 'reject';
    notes?: string;
    photo_url?: string;
    created_at: string;
}

export interface GradeDistribution {
    A: number;
    B: number;
    C: number;
    reject: number;
    total: number;
}

export const qcService = {
    /**
     * Log a new quality inspection
     */
    async logInspection(params: {
        orchardId: string;
        pickerId: string;
        inspectorId: string;
        grade: 'A' | 'B' | 'C' | 'reject';
        notes?: string;
        photoUrl?: string;
    }): Promise<QCInspection | null> {
        const payload = {
            orchard_id: params.orchardId,
            picker_id: params.pickerId,
            inspector_id: params.inspectorId,
            grade: params.grade,
            notes: params.notes || null,
            photo_url: params.photoUrl || null,
        };

        const { data, error } = await qcRepository.insert(payload);

        if (error) {
            // 🔧 L31: Queue offline instead of silently dropping the inspection
            if (error.message?.includes('Failed to fetch') || error.message?.includes('Network') || !navigator.onLine) {
                await syncService.addToQueue('QC_INSPECTION', payload as QCInspectionPayload);
                logger.warn('[QCService] Inspection queued for offline sync');
                return { ...payload, id: 'pending-sync', created_at: new Date().toISOString() } as QCInspection;
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
