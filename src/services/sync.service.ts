/**
 * Cola de sincronización offline (fachada pública). La lógica vive en sync-queue/:
 * - categorizeError.ts: tipo de error y reintentos por tipo
 * - dispatchItem.ts: validación Zod + procesador de cada tipo
 * - runQueuePass.ts: una pasada (reintentos, corte por red, dead letter queue)
 * - queueStore.ts: IndexedDB (cola, DLQ, última sincronización, resumen)
 * - retryScheduler.ts: reintento automático con espera creciente
 * Aquí quedan el cerrojo entre pestañas y el arranque automático.
 */
import { db } from './db';
import type { QueuedSyncItem } from './db';
import { logger } from '@/utils/logger';
import type { PendingItem, SyncPayload } from './sync-processors';
import { categorizeError as categorize } from './sync-queue/categorizeError';
import type { SyncErrorCategory } from './sync-queue/categorizeError';
import { runQueuePass } from './sync-queue/runQueuePass';
import { scheduleRetry } from './sync-queue/retryScheduler';
import {
  enqueueItem,
  readQueue,
  putDeadLetter,
  readDeadLetters,
  readLastSyncTime,
  writeLastSyncTime,
  summarizeQueue,
} from './sync-queue/queueStore';
import type { QueueSummary, DeadLetterRow } from './sync-queue/queueStore';

export type { PendingItem };

// 🔧 R8-Fix1: mutex entre pestañas con Web Locks API (navigator.locks).
// Este flag solo es el respaldo para navegadores sin Web Locks.
let isProcessing = false;

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine;

export const syncService = {
  // 1. Encolar (se guarda en IndexedDB al momento)
  // updated_at: el updated_at actual del registro, para el bloqueo optimista en UPDATEs
  async addToQueue(type: PendingItem['type'], payload: SyncPayload, updated_at?: string) {
    const id = await enqueueItem(type, payload as Record<string, unknown>, updated_at);
    // Con red, intentar enviarlo ya
    if (navigator.onLine) {
      this.processQueue();
    }
    return id;
  },

  // 2. Cola en orden de llegada
  async getQueue(): Promise<QueuedSyncItem[]> {
    return readQueue();
  },

  // 3. Procesar la cola — con cerrojo entre pestañas
  async processQueue() {
    if (!navigator.onLine) return;
    const runAndReschedule = async () => {
      await this._doProcessQueue();
      scheduleRetry(isOnline() ? await db.sync_queue.count() : 0, () => {
        syncService.processQueue();
      });
    };

    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request('harvest_sync_lock', { ifAvailable: true }, async lock => {
        if (!lock) {
          logger.info('[SyncService] Another tab is already syncing. Skipping.');
          return;
        }
        await runAndReschedule();
      });
      return;
    }
    // Respaldo sin Web Locks (Safari privado, etc.)
    if (isProcessing) return;
    isProcessing = true;
    try {
      await runAndReschedule();
    } finally {
      isProcessing = false;
    }
  },

  // Interno: una pasada por la cola (con el cerrojo ya cogido)
  async _doProcessQueue() {
    await runQueuePass(this);
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
    return putDeadLetter(item, failureReason, errorCode, retryCount);
  },

  /** Lo que no se pudo enviar desde este móvil (dead letter queue), lo último primero */
  async getDeadLetters(limit = 50): Promise<DeadLetterRow[]> {
    return readDeadLetters(limit);
  },

  // 4. Pendientes (para los badges de la UI)
  async getPendingCount(): Promise<number> {
    return await db.sync_queue.count();
  },

  // 5. Última sincronización (IndexedDB)
  async getLastSyncTime(): Promise<number | null> {
    return readLastSyncTime();
  },

  async setLastSyncTime() {
    await writeLastSyncTime();
  },

  // 6. Mayor número de reintentos (para la UI)
  async getMaxRetryCount(): Promise<number> {
    const queue = await this.getQueue();
    if (queue.length === 0) return 0;
    return Math.max(...queue.map(item => item.retryCount));
  },

  /** 7. Resumen de la cola por tipo, con reintentos */
  async getQueueSummary(): Promise<QueueSummary> {
    const queue = await this.getQueue();
    return summarizeQueue(queue, await this.getLastSyncTime());
  },

  /** 8. Categoría del error — network | server | validation | unknown */
  categorizeError(error: unknown): SyncErrorCategory {
    return categorize(error, navigator.onLine);
  },
};

// Arranque automático al volver la red.
// 🔧 C-3: jitter de 0-10 s para que 200+ móviles que recuperan señal a la vez
// (fin de descanso) no lleguen todos juntos a Supabase. El cerrojo solo es
// dentro del mismo dispositivo.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const jitter = Math.floor(Math.random() * 10_000); // 0–10 000ms
    setTimeout(() => syncService.processQueue(), jitter);
  });

  // También al cargar (escalonado por los tiempos de carga de cada móvil)
  setTimeout(() => syncService.processQueue(), 5000);
}
