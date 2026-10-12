import { useEffect, useRef, useCallback } from 'react';
import { useHarvestStore } from '../../stores/useHarvestStore';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { offlineService } from '../../services/offline.service';
import { logger } from '@/utils/logger';

const BASE_DELAY = 5_000; // 5 segundos
const MAX_DELAY = 300_000; // tope 5 minutos
const BATCH_SIZE = 50;

type ScanResult = {
    id: string | null;
    status: 'saved' | 'duplicate' | 'rejected' | 'retry';
    reason?: string;
};

/**
 * Sube las cubetas escaneadas sin conexión.
 *
 * - Va por la función record-bucket (resuelve tarjeta → persona, aplica la
 *   semana cerrada y guarda en bucket_records).
 * - Cada escaneo lleva su id del móvil: si un envío se cortó a medias y se
 *   repite, el servidor lo reconoce y no se duplica.
 * - Un rechazo definitivo (semana cerrada, tarjeta desconocida) se aparta con
 *   su motivo en vez de reintentarlo para siempre.
 * - Sin conexión no intenta nada; al volver la conexión sube al momento.
 */
export const HarvestSyncBridge = () => {
    const retryDelay = useRef(BASE_DELAY);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const running = useRef(false);
    const syncRef = useRef<(() => Promise<void>) | null>(null);

    const scheduleNext = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            syncRef.current?.();
        }, retryDelay.current);
    }, []);

    const syncPendingBuckets = useCallback(async () => {
        if (running.current) return;
        running.current = true;
        try {
            const { buckets, markAsSynced, markAsFailed } = useHarvestStore.getState();
            const pending = buckets.filter(b => !b.synced && !b.failed);

            if (pending.length === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
                retryDelay.current = BASE_DELAY;
                return;
            }

            // Los más antiguos primero
            const ordered = [...pending].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            let anyRetry = false;

            for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
                const chunk = ordered.slice(i, i + BATCH_SIZE);
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
                        logger.warn(`[Bridge] Bucket ${b.id} rejected: ${r.reason}`);
                        markAsFailed(b.id, r.reason || 'Rejected');
                    }
                }
            }

            retryDelay.current = anyRetry ? Math.min(retryDelay.current * 2, MAX_DELAY) : BASE_DELAY;
            offlineService.cleanupSynced().catch(e => logger.error('[Bridge] Cleanup failed:', e));
        } catch (e) {
            // Sin red / servidor caído: se reintenta más tarde (o al volver la conexión)
            logger.warn('[Bridge] Upload failed, will retry:', e);
            retryDelay.current = Math.min(retryDelay.current * 2, MAX_DELAY);
        } finally {
            running.current = false;
            scheduleNext();
        }
    }, [scheduleNext]);

    useEffect(() => {
        syncRef.current = syncPendingBuckets;
    }, [syncPendingBuckets]);

    useEffect(() => {
        const onOnline = () => {
            retryDelay.current = BASE_DELAY;
            syncPendingBuckets();
        };
        window.addEventListener('online', onOnline);
        syncPendingBuckets();
        return () => {
            window.removeEventListener('online', onOnline);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [syncPendingBuckets]);

    return null;
};
