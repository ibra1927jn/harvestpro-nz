/**
 * Fraud Detection Service — Frontend Bridge to Server-Side Engine
 * 
 * SECURITY: Real fraud detection runs server-side in the Edge Function
 * `detect-anomalies`. This service acts as a bridge, calling the backend.
 *
 * Three core principles implemented server-side:
 * 1. ELAPSED TIME VELOCITY — buckets ÷ elapsed time since last collection
 * 2. PEER COMPARISON — compare picker to peers in same row
 * 3. GRACE PERIOD — first 90 min = warmup, only extreme outliers flagged
 */

import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { AnomalyResponseSchema, validateResponseSafe } from '@/schemas/api.schemas';
import { logger } from '@/utils/logger';
import { anomalyDismissalsRepository, type AnomalyDismissalRow } from '@/repositories/anomaly-dismissals.repository';

export type { AnomalyDismissalRow };

export type AnomalyType =
    | 'impossible_velocity'
    | 'peer_outlier'
    | 'off_hours'
    | 'duplicate_proximity'
    | 'post_collection_spike';

export interface Anomaly {
    id: string;
    type: AnomalyType;
    severity: 'low' | 'medium' | 'high';
    pickerId: string;
    pickerName: string;
    detail: string;
    timestamp: string;
    evidence: Record<string, unknown>;
    rule: 'elapsed_velocity' | 'peer_comparison' | 'grace_period_exempt' | 'off_hours' | 'duplicate';
}

export interface DetectionConfig {
    gracePeriodMinutes: number;
    peerOutlierThreshold: number;
    maxPhysicalRate: number;
    postCollectionWindowMinutes: number;
    shiftStartHour: number;
    shiftEndHour: number;
}

const DEFAULT_CONFIG: DetectionConfig = {
    gracePeriodMinutes: 90,
    peerOutlierThreshold: 3.0,
    maxPhysicalRate: 8,
    postCollectionWindowMinutes: 20,
    shiftStartHour: 6,
    shiftEndHour: 19,
};

/**
 * Clave estable de una anomalía: detect-anomalies genera ids nuevos en cada
 * llamada, así que el descarte se guarda por tipo + recolector + hora del evento.
 */
export function anomalyKey(a: Pick<Anomaly, 'type' | 'pickerId' | 'timestamp'>): string {
    return `${a.type}|${a.pickerId}|${a.timestamp}`;
}

export const fraudDetectionService = {
    config: { ...DEFAULT_CONFIG },

    /**
     * Fetch anomalies from the backend Edge Function.
     * Returns empty array if offline or Edge Function unavailable.
     */
    fetchAnomalies: async (orchardId: string): Promise<Anomaly[]> => {
        try {
            const { data, error } = await edgeFunctionsRepository.invoke('detect-anomalies', {
                orchard_id: orchardId,
            });

            if (error) {
                logger.warn('[FraudDetection] Edge Function error:', error.message);
                return [];
            }

            const validated = validateResponseSafe(
                AnomalyResponseSchema,
                data,
                'detectAnomalies',
                { anomalies: [], stats: { total: 0 } }
            );
            return validated.anomalies;
        } catch (err) {
            logger.warn('[FraudDetection] Network error:', err);
            return [];
        }
    },

    /**
     * Descartes reales del huerto desde una fecha (antes una lista fija de
     * ejemplos en el código). Sin conexión o sin permiso: lista vacía.
     */
    listDismissals: async (orchardId: string, sinceIso: string): Promise<AnomalyDismissalRow[]> => {
        try {
            return await anomalyDismissalsRepository.listSince(orchardId, sinceIso);
        } catch (err) {
            logger.warn('[FraudDetection] Could not load dismissals:', err);
            return [];
        }
    },

    /** Descarta una anomalía (falsa alarma) con un motivo opcional. Lanza si no se guarda. */
    dismissAnomaly: (orchardId: string, anomaly: Anomaly, reason: string | null): Promise<AnomalyDismissalRow> =>
        anomalyDismissalsRepository.insert({
            orchard_id: orchardId,
            anomaly_key: anomalyKey(anomaly),
            anomaly_type: anomaly.type,
            picker_id: /^[0-9a-f-]{36}$/i.test(anomaly.pickerId) ? anomaly.pickerId : null,
            picker_name: anomaly.pickerName?.slice(0, 120) ?? null,
            detail: anomaly.detail?.slice(0, 500) ?? null,
            anomaly_at: anomaly.timestamp || null,
            reason: reason?.trim().slice(0, 500) || null,
        }),

    /** Deshace un descarte (la anomalía vuelve a la lista) */
    undoDismissal: (id: string): Promise<void> => anomalyDismissalsRepository.remove(id),
};
