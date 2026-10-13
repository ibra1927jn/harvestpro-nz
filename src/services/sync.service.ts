import { bucketLedgerService } from './bucket-ledger.service';
import { simpleMessagingService } from './simple-messaging.service';
import { userService } from './user.service';
import { conflictService } from './conflict.service';
import { toNZST, nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { db } from './db';
import { analytics } from '@/config/analytics';
import type { QueuedSyncItem } from './db';

import { safeUUID } from '@/utils/uuid';
import {
  processContract,
  processTransport,
  processTimesheet,
  processAttendance,
  processPicker,
  processQCInspection,
  processUnlink,
} from './sync-processors';
import type { PendingItem, SyncPayload, AttendancePayload, PickerPayload, QCInspectionPayload } from './sync-processors';

export type { PendingItem };

/** ZodError sin importar zod (name + issues, como lo construye zod 4). */
function isZodError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

// 🔧 R8-Fix1: Cross-tab mutex using Web Locks API
// The old `let isProcessing` only guarded within ONE tab.
// navigator.locks works across all tabs in the same origin.
let isProcessing = false; // Fallback for browsers without Web Locks

// Reintento automático: si queda algo tras una pasada con red (503, timeout),
// antes nadie volvía a intentarlo hasta otro evento (volver la red, encolar
// otra cosa, reabrir la app, el botón de sincronizar). Espera creciente.
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 300_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_BASE_MS;

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine;

function scheduleRetry(remaining: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (remaining === 0 || typeof window === 'undefined') {
    retryDelay = RETRY_BASE_MS;
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncService.processQueue();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

export const syncService = {
  // 1. Add to Queue (Persist to IndexedDB immediately)
  // updated_at: pass the record's current updated_at to enable optimistic locking on UPDATEs
  async addToQueue(type: PendingItem['type'], payload: SyncPayload, updated_at?: string) {
    // Marca de orden estrictamente creciente: dos acciones en el mismo ms, o con
    // el reloj del móvil atrasado de golpe, se suben en el orden en que se hicieron
    const last = await db.sync_queue.orderBy('timestamp').last();
    const newItem: QueuedSyncItem = {
      id: safeUUID(),
      type,
      payload: payload as Record<string, unknown>,
      timestamp: Math.max(Date.now(), (last?.timestamp ?? 0) + 1),
      retryCount: 0,
      ...(updated_at ? { updated_at } : {}),
    };

    await db.sync_queue.put(newItem);

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.processQueue();
    }

    return newItem.id;
  },

  // 2. Get Queue (from IndexedDB)
  async getQueue(): Promise<QueuedSyncItem[]> {
    try {
      // En el orden en que se encoló (el id es un UUID aleatorio: por id el orden
      // era al azar, y "aprobar" y luego "rechazar" offline podía quedar aprobado)
      return await db.sync_queue.orderBy('timestamp').toArray();
    } catch (e) {
      logger.error('SyncService: Failed to read queue from IndexedDB', e);
      return [];
    }
  },

  // 3. Process Queue — with cross-tab lock
  // 🔧 R8-Fix1: Uses Web Locks API for cross-tab mutex
  async processQueue() {
    if (!navigator.onLine) return;

    // Web Locks API: cross-tab mutex at browser/OS level
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request('harvest_sync_lock', { ifAvailable: true }, async lock => {
        if (!lock) {
          logger.info('[SyncService] Another tab is already syncing. Skipping.');
          return;
        }
        await this._doProcessQueue();
        scheduleRetry(isOnline() ? await db.sync_queue.count() : 0);
      });
    } else {
      // Fallback for browsers without Web Locks (Safari private mode, etc.)
      if (isProcessing) return;
      isProcessing = true;
      try {
        await this._doProcessQueue();
        scheduleRetry(isOnline() ? await db.sync_queue.count() : 0);
      } finally {
        isProcessing = false;
      }
    }
  },

  // Internal: actual queue processing logic (called under lock)
  async _doProcessQueue() {
    const syncStartTime = Date.now(); // M-3: capture actual start time for analytics
    const queue = await this.getQueue();
    if (queue.length === 0) return;
    // Zod (~45 KB gzip) solo se carga cuando hay algo que sincronizar, no en el arranque
    const schemas = await import('./sync.schemas');

    const processedIds: string[] = [];
    let consecutiveNetworkErrors = 0;

    for (const item of queue) {
      try {
        switch (item.type) {
          case 'SCAN': {
            // 🔧 BUG-3 fix: validate payload before processing
            const scanData = schemas.ScanPayloadSchema.parse(item.payload);
            await bucketLedgerService.recordBucket({
              ...scanData,
              scanned_at: toNZST(new Date(item.timestamp)),
            } as Parameters<typeof bucketLedgerService.recordBucket>[0]);
            break;
          }

          case 'ATTENDANCE':
            await processAttendance(item.payload as AttendancePayload, item.updated_at);
            break;

          case 'ASSIGNMENT': {
            const assignData = schemas.AssignmentPayloadSchema.parse(item.payload);
            await userService.assignUserToOrchard(assignData.userId, assignData.orchardId);
            break;
          }

          case 'MESSAGE': {
            const msgData = schemas.MessagePayloadSchema.parse(item.payload);
            await simpleMessagingService.sendMessage(
              msgData.receiverId,
              msgData.content,
              msgData.type || 'direct'
            );
            break;
          }

          // Delegated to extracted Strategy processors (with Zod validation)
          case 'CONTRACT':
            await processContract(schemas.ContractPayloadSchema.parse(item.payload), item.updated_at);
            break;

          case 'TRANSPORT':
            await processTransport(schemas.TransportPayloadSchema.parse(item.payload), item.updated_at);
            break;

          case 'TIMESHEET':
            await processTimesheet(schemas.TimesheetPayloadSchema.parse(item.payload), item.updated_at);
            break;

          case 'PICKER':
            await processPicker(schemas.PickerPayloadSchema.parse(item.payload) as PickerPayload);
            break;

          case 'QC_INSPECTION':
            await processQCInspection(schemas.QCInspectionPayloadSchema.parse(item.payload) as QCInspectionPayload);
            break;

          case 'UNLINK':
            await processUnlink(schemas.UnlinkPayloadSchema.parse(item.payload));
            break;

          default: {
            // Tipo que esta versión no sabe procesar (cola de otra versión de la
            // app, dato corrupto): antes se borraba sin dejar rastro. Ahora va a
            // la dead letter queue con el motivo (reintentarlo no lo arregla).
            const unknownType = String((item as { type: unknown }).type);
            logger.warn(`[SyncService] Unknown item type: ${unknownType} → dead letter`);
            if (await this.moveToDeadLetter(item, `unknown_type: ${unknownType}`, 'UNKNOWN_TYPE', 0)) {
              processedIds.push(item.id);
            }
            continue;
          }
        }

        // If we reach here, sync was successful — mark for removal
        processedIds.push(item.id);
        consecutiveNetworkErrors = 0;
      } catch (e) {
        const errorCategory = this.categorizeError(e);
        logger.error(`[SyncService] Failed to sync item ${item.id} (${errorCategory})`, e);

        // 🔧 U2: sin red se corta la pasada (no tiene sentido seguir). Con red
        // ("online" pero la petición falló) cuenta como un reintento y se sigue
        // con los de detrás; tres fallos de red seguidos cortan la pasada (señal
        // mala de verdad). Antes se cortaba siempre y sin límite: un elemento que
        // fallaba con un mensaje con "fetch" bloqueaba toda la cola para siempre.
        if (errorCategory === 'network') {
          consecutiveNetworkErrors++;
          if (!navigator.onLine || consecutiveNetworkErrors >= 3) {
            logger.warn('[SyncService] Network down — aborting queue processing');
            await db.sync_queue.update(item.id, { retryCount: item.retryCount + 1 });
            break;
          }
        } else {
          consecutiveNetworkErrors = 0;
        }

        const newRetryCount = item.retryCount + 1;
        // Red: más margen (horas de mala señal no deben mandar nada a la DLQ)
        const maxRetries = errorCategory === 'validation' ? 5 : errorCategory === 'network' ? 200 : 50;

        if (newRetryCount < maxRetries) {
          await db.sync_queue.update(item.id, { retryCount: newRetryCount });
        } else {
          logger.error(
            `[SyncService] Giving up on item ${item.id} after ${newRetryCount} retries (${errorCategory}).`
          );
          await conflictService.detect(
            item.type.toLowerCase(),
            item.id,
            toNZST(new Date(item.timestamp)),
            nowNZST(),
            item.payload,
            { error: 'max_retries_exceeded', category: errorCategory, retryCount: newRetryCount }
          );
          // Persist to DLQ in IndexedDB for admin review
          const moved = await this.moveToDeadLetter(
            item,
            `${errorCategory}: max retries exceeded`,
            e instanceof Error ? e.message : String(e),
            newRetryCount
          );
          if (moved) {
            // 🔧 V28: Only delete from sync_queue if DLQ insert succeeded
            processedIds.push(item.id);
            // 📊 PostHog: Track DLQ error for monitoring
            analytics.trackDLQError(errorCategory, newRetryCount > 30 ? 'critical' : 'high');
          }
        }
      }
    }

    // Bulk-delete processed items from IndexedDB
    if (processedIds.length > 0) {
      await db.sync_queue.bulkDelete(processedIds);
    }

    // Track last successful sync time + analytics
    if (processedIds.length > 0) {
      await this.setLastSyncTime();
      // 📊 PostHog: Track sync batch completion
      const syncDuration = Date.now() - syncStartTime; // M-3: actual sync duration
      analytics.trackSync(processedIds.length, syncDuration, true);
    }
  },

  /**
   * Mueve un elemento a la dead letter queue (IndexedDB). Devuelve false si no
   * se pudo guardar: entonces se queda en la cola (mejor atascado que perdido).
   */
  async moveToDeadLetter(
    item: QueuedSyncItem,
    failureReason: string,
    errorCode: string,
    retryCount: number
  ): Promise<boolean> {
    try {
      await db.dead_letter_queue.put({
        id: item.id,
        type: item.type,
        payload: item.payload,
        timestamp: item.timestamp,
        retryCount,
        failureReason,
        errorCode,
        movedAt: Date.now(),
      });
      return true;
    } catch (dlqError) {
      logger.error('[SyncService] CRITICAL: DLQ insert failed. Item preserved in sync_queue:', dlqError);
      return false;
    }
  },

  /** Lo que no se pudo enviar desde este móvil (dead letter queue), lo último primero */
  async getDeadLetters(limit = 50): Promise<Array<{ id: string; type: string; failureReason: string; movedAt: number }>> {
    try {
      const items = await db.dead_letter_queue.toArray();
      return items
        .sort((a, b) => b.movedAt - a.movedAt)
        .slice(0, limit)
        .map(i => ({ id: i.id, type: i.type, failureReason: i.failureReason, movedAt: i.movedAt }));
    } catch (e) {
      logger.warn('[SyncService] Failed to read dead letter queue:', e);
      return [];
    }
  },

  // 4. Get Pending Count (For UI Badges)
  async getPendingCount(): Promise<number> {
    return await db.sync_queue.count();
  },

  // 5. Last Sync Timestamp (from IndexedDB)
  async getLastSyncTime(): Promise<number | null> {
    try {
      const meta = await db.sync_meta.get('lastSync');
      return meta ? (meta.value as number) : null;
    } catch (e) {
      logger.warn('[SyncService] Failed to read last sync time:', e);
      return null;
    }
  },


  async setLastSyncTime() {
    try {
      await db.sync_meta.put({ id: 'lastSync', value: Date.now() });
    } catch (e) {
      logger.warn('[SyncService] Failed to save last sync time:', e);
    }
  },

  // 6. Get Max Retry Count (for UI display)
  async getMaxRetryCount(): Promise<number> {
    const queue = await this.getQueue();
    if (queue.length === 0) return 0;
    return Math.max(...queue.map(item => item.retryCount));
  },

  /**
   * 7. Queue Summary — Per-type breakdown with retry stats
   */
  async getQueueSummary(): Promise<{
    total: number;
    byType: Record<string, number>;
    maxRetry: number;
    oldestTimestamp: number | null;
    lastSync: number | null;
  }> {
    const queue = await this.getQueue();
    const byType: Record<string, number> = {};

    for (const item of queue) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }

    return {
      total: queue.length,
      byType,
      maxRetry: queue.length > 0 ? Math.max(...queue.map(i => i.retryCount)) : 0,
      oldestTimestamp: queue.length > 0 ? Math.min(...queue.map(i => i.timestamp)) : null,
      lastSync: await this.getLastSyncTime(),
    };
  },

  /**
   * 8. Categorize Error — network | server | validation | unknown
   */
  categorizeError(error: unknown): 'network' | 'server' | 'validation' | 'unknown' {
    if (!navigator.onLine) return 'network';

    // Payload que no pasa el esquema: no se arregla reintentando.
    // Comprobación estructural: zod se carga bajo demanda (sync.schemas.ts)
    if (isZodError(error)) return 'validation';

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('aborted')
      ) {
        return 'network';
      }
      // Códigos HTTP como palabra: "23503" (clave foránea) contiene "503"
      if (/\b(500|502|503|429)\b/.test(msg)) {
        return 'server';
      }
      if (
        // SQLSTATE clase 23 (integridad), no cualquier "23" (LOC-023, fila 23...)
        /\b23\d{3}\b/.test(msg) ||
        msg.includes('constraint') ||
        msg.includes('violat') ||
        msg.includes('unique') ||
        msg.includes('foreign key') ||
        msg.includes('conflict') ||
        msg.includes('optimistic lock')
      ) {
        return 'validation';
      }
    }

    // Supabase error objects
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = String((error as Record<string, unknown>).code);
      if (code.startsWith('23')) return 'validation';
      // Códigos de PostgREST: PGRST116, PGRST301… (nunca son exactamente 'PGRST')
      if (code.startsWith('PGRST')) return 'server';
    }

    return 'unknown';
  },
};

// Auto-start processing when online
// 🔧 C-3: Jitter 0-10s for cross-device thundering herd prevention.
// The Web Locks mutex (harvest_sync_lock) prevents races WITHIN the same device,
// but is NOT cross-device. With 200+ devices reconnecting simultaneously after
// end-of-row break, Supabase would receive 200 parallel bursts.
// 10s max jitter is imperceptible to field workers (scan data still ships in ≤10s).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const jitter = Math.floor(Math.random() * 10_000); // 0–10 000ms
    setTimeout(() => syncService.processQueue(), jitter);
  });

  // Also try on load (staggered by natural page load times)
  setTimeout(() => syncService.processQueue(), 5000);
}
