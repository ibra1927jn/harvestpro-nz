
// Clean imports
import { BucketEvent } from '../types';
import { logger } from '@/utils/logger';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { bucketLedgerRepository } from '@/repositories/bucket-ledger.repository';



export const bucketLedgerService = {
    /**
     * The Single Source of Truth for Bucket Recording — via Edge Function (server-side)
     * 
     * Server-side validation prevents:
     * - DevTools manipulation of bucket counts
     * - Badge ID spoofing
     * - Injection of fake scan records
     */
    async recordBucket(event: BucketEvent) {
        try {
            const { data, error } = await edgeFunctionsRepository.invoke<{
                id: string;
                picker_id: string;
                scanned_at: string;
                resolved_from_badge: boolean;
            }>('record-bucket', {
                picker_id: event.picker_id,
                orchard_id: event.orchard_id,
                row_number: event.row_number,
                quality_grade: event.quality_grade,
                bin_id: event.bin_id,
                scanned_by: event.scanned_by,
                scanned_at: event.scanned_at,
                // Hora del móvil al enviar: el servidor mide el desfase, corrige y lo apunta
                ...(event.scanned_at ? { client_now: Date.now() } : {}),
            });

            if (error) throw new Error(error.message);
            return data;
        } catch (err) {
            logger.error('[Ledger] Record bucket via Edge Function failed:', err);
            throw err;
        }
    },

    /**
     * Fetch recent history for a picker (read-only, stays client-side)
     */
    async getPickerHistory(pickerId: string) {
        return bucketLedgerRepository.getPickerHistory(pickerId);
    }
};

