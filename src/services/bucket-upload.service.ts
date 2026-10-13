/**
 * Subida de las cubetas escaneadas sin conexión (una pasada).
 *
 * - Va por la función record-bucket (resuelve tarjeta → persona, aplica la
 *   semana cerrada y guarda en bucket_records).
 * - Cada escaneo lleva su id del móvil: si un envío se cortó a medias y se
 *   repite, el servidor lo reconoce y no se duplica.
 * - Un rechazo definitivo (semana cerrada, tarjeta desconocida) se aparta con
 *   su motivo en vez de reintentarlo para siempre.
 *
 * HarvestSyncBridge decide cuándo llamarla (temporizador, vuelta de la red).
 */
import { useHarvestStore } from '@/stores/useHarvestStore';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { offlineService } from './offline.service';
import { logger } from '@/utils/logger';

export const BUCKET_BATCH_SIZE = 50;

export type ScanResult = {
    id: string | null;
    status: 'saved' | 'duplicate' | 'rejected' | 'retry';
    reason?: string;
};

/** idle: nada que subir · offline: sin red · done: todo resuelto · retry: queda algo para luego */
export type UploadOutcome = 'idle' | 'offline' | 'done' | 'retry';

/**
 * Sube lo pendiente, del más antiguo al más nuevo, en lotes.
 * Lanza si la petición falla (sin red, 5xx, timeout): lo pendiente sigue pendiente.
 */
export async function uploadPendingBuckets(): Promise<UploadOutcome> {
    const { buckets, markAsSynced, markAsFailed } = useHarvestStore.getState();
    const pending = buckets.filter(b => !b.synced && !b.failed);

    if (pending.length === 0) return 'idle';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

    // Los más antiguos primero
    const ordered = [...pending].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let anyRetry = false;

    for (let i = 0; i < ordered.length; i += BUCKET_BATCH_SIZE) {
        const chunk = ordered.slice(i, i + BUCKET_BATCH_SIZE);
        const scans = chunk.map(b => ({
            id: b.id,
            picker_id: b.picker_id,
            orchard_id: b.orchard_id,
            quality_grade: b.quality_grade,
            scanned_at: b.timestamp,
            ...(b.row_number ? { row_number: b.row_number } : {}),
            ...(b.bin_id ? { bin_id: b.bin_id } : {}),
        }));

        // Si se corta a mitad y se repite, los ids evitan duplicados
        const { data } = await edgeFunctionsRepository.invoke<{ results: ScanResult[] }>(
            'record-bucket',
            { scans },
            { maxRetries: 1, timeoutMs: 30_000 }
        );
        const results = data?.results ?? [];
        const byId = new Map(results.filter(r => r.id).map(r => [r.id as string, r]));

        for (const b of chunk) {
            const r = byId.get(b.id);
            if (!r || r.status === 'retry') {
                anyRetry = true;
            } else if (r.status === 'saved' || r.status === 'duplicate') {
                markAsSynced(b.id);
            } else {
                logger.warn(`[Upload] Bucket ${b.id} rejected: ${r.reason}`);
                markAsFailed(b.id, r.reason || 'Rejected');
            }
        }
    }

    offlineService.cleanupSynced().catch(e => logger.error('[Upload] Cleanup failed:', e));
    return anyRetry ? 'retry' : 'done';
}
