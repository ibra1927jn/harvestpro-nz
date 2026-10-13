/**
 * Persistencia de la cola de sincronización en IndexedDB: encolar, leer en orden,
 * dead letter queue y marca de última sincronización.
 */
import { logger } from '@/utils/logger';
import { safeUUID } from '@/utils/uuid';
import { db } from '../db';
import type { QueuedSyncItem } from '../db';

export interface QueueSummary {
  total: number;
  byType: Record<string, number>;
  maxRetry: number;
  oldestTimestamp: number | null;
  lastSync: number | null;
}

export interface DeadLetterRow {
  id: string;
  type: string;
  failureReason: string;
  movedAt: number;
}

/** Guarda el elemento y devuelve su id */
export async function enqueueItem(
  type: QueuedSyncItem['type'],
  payload: Record<string, unknown>,
  updated_at?: string
): Promise<string> {
  // Marca de orden estrictamente creciente: dos acciones en el mismo ms, o con
  // el reloj del móvil atrasado de golpe, se suben en el orden en que se hicieron
  const last = await db.sync_queue.orderBy('timestamp').last();
  const newItem: QueuedSyncItem = {
    id: safeUUID(),
    type,
    payload,
    timestamp: Math.max(Date.now(), (last?.timestamp ?? 0) + 1),
    retryCount: 0,
    ...(updated_at ? { updated_at } : {}),
  };
  await db.sync_queue.put(newItem);
  return newItem.id;
}

export async function readQueue(): Promise<QueuedSyncItem[]> {
  try {
    // En el orden en que se encoló (el id es un UUID aleatorio: por id el orden
    // era al azar, y "aprobar" y luego "rechazar" offline podía quedar aprobado)
    return await db.sync_queue.orderBy('timestamp').toArray();
  } catch (e) {
    logger.error('SyncService: Failed to read queue from IndexedDB', e);
    return [];
  }
}

/**
 * Mueve un elemento a la dead letter queue (IndexedDB). Devuelve false si no
 * se pudo guardar: entonces se queda en la cola (mejor atascado que perdido).
 */
export async function putDeadLetter(
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
}

/** Lo que no se pudo enviar desde este móvil (dead letter queue), lo último primero */
export async function readDeadLetters(limit: number): Promise<DeadLetterRow[]> {
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
}

export async function readLastSyncTime(): Promise<number | null> {
  try {
    const meta = await db.sync_meta.get('lastSync');
    return meta ? (meta.value as number) : null;
  } catch (e) {
    logger.warn('[SyncService] Failed to read last sync time:', e);
    return null;
  }
}

export async function writeLastSyncTime(): Promise<void> {
  try {
    await db.sync_meta.put({ id: 'lastSync', value: Date.now() });
  } catch (e) {
    logger.warn('[SyncService] Failed to save last sync time:', e);
  }
}

/** Resumen por tipo con el mayor reintento y el elemento más antiguo */
export function summarizeQueue(queue: QueuedSyncItem[], lastSync: number | null): QueueSummary {
  const byType: Record<string, number> = {};
  for (const item of queue) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }
  return {
    total: queue.length,
    byType,
    maxRetry: queue.length > 0 ? Math.max(...queue.map(i => i.retryCount)) : 0,
    oldestTimestamp: queue.length > 0 ? Math.min(...queue.map(i => i.timestamp)) : null,
    lastSync,
  };
}
