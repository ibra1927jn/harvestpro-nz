import { useEffect, useRef, useCallback } from 'react';
import { uploadPendingBuckets } from '@/services/bucket-upload.service';
import { logger } from '@/utils/logger';

const BASE_DELAY = 5_000; // 5 segundos
const MAX_DELAY = 300_000; // tope 5 minutos

/**
 * Sube las cubetas escaneadas sin conexión (ver bucket-upload.service).
 *
 * Sin conexión no intenta nada; al volver la conexión sube al momento. Si algo
 * queda para reintentar (fallo de red, servidor caído) espera cada vez más,
 * con un tope de 5 minutos.
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
            const outcome = await uploadPendingBuckets();
            retryDelay.current = outcome === 'retry' ? Math.min(retryDelay.current * 2, MAX_DELAY) : BASE_DELAY;
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
