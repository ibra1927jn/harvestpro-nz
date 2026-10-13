/**
 * useOfflineQueue — Processes queued offline operations (unlinks) on reconnect
 * Extracted from Manager.tsx for reuse and testability.
 * @module hooks/useOfflineQueue
 */
import { useEffect } from 'react';
import { db } from '@/services/db';
import { syncService } from '@/services/sync.service';
import { logger } from '@/utils/logger';

/**
 * Al volver la conexión (o al abrir la pantalla con red) sube las bajas
 * (UNLINK) pendientes y refresca los datos.
 *
 * La subida la hace la cola general (syncService): bajo el mismo cerrojo entre
 * pestañas y con la misma política de reintentos y dead letter queue. Antes
 * este hook las procesaba por su cuenta (fuera del cerrojo: la misma baja podía
 * mandarse dos veces) y las BORRABA sin aviso tras 3 fallos.
 *
 * @param fetchGlobalData - Callback to refresh store data after processing
 */
export function useOfflineQueue(fetchGlobalData: () => void) {
    useEffect(() => {
        const processQueue = async () => {
            try {
                const pending = await db.sync_queue.where('type').equals('UNLINK').count();
                if (pending === 0) return;

                logger.info(`[Offline] Connection restored — processing ${pending} queued unlinks`);
                await syncService.processQueue();
                await fetchGlobalData();
            } catch (e) {
                logger.error('[Offline] Queue processing error:', e);
            }
        };

        // Process on mount (in case we came online while the app was closed)
        if (navigator.onLine) processQueue();

        window.addEventListener('online', processQueue);
        return () => window.removeEventListener('online', processQueue);
    }, [fetchGlobalData]);
}
