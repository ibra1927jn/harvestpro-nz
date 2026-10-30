/**
 * Una pasada por la cola (se llama ya con el cerrojo cogido): envía cada elemento,
 * cuenta reintentos, manda a la dead letter queue lo que no tiene arreglo y borra
 * lo terminado.
 */
import { conflictService } from '../conflict.service';
import { toNZST, nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { analytics } from '@/config/analytics';
import { db } from '../db';
import type { QueuedSyncItem } from '../db';
import { dispatchSyncItem } from './dispatchItem';
import { maxRetriesFor } from './categorizeError';
import type { SyncErrorCategory } from './categorizeError';
import { isSyncRejected } from './rejectedError';

/** Lo que la pasada usa del servicio (por `this`, para que se pueda espiar/sustituir) */
export interface QueuePassDeps {
  getQueue(): Promise<QueuedSyncItem[]>;
  categorizeError(error: unknown): SyncErrorCategory;
  moveToDeadLetter(item: QueuedSyncItem, failureReason: string, errorCode: string, retryCount: number): Promise<boolean>;
  setLastSyncTime(): Promise<void>;
}

/** Fallos de red seguidos que cortan la pasada (señal mala de verdad) */
const MAX_CONSECUTIVE_NETWORK_ERRORS = 3;

type FailureOutcome = 'stop' | 'removed' | 'kept';

interface PassState {
  consecutiveNetworkErrors: number;
  /** Grupos con un elemento sin enviar en esta pasada: los de detrás esperan */
  blockedGroups: Set<string>;
}

/**
 * Elementos que deben llegar en orden (entrada → descanso → salida de la misma
 * persona): si uno no se pudo enviar, los siguientes del grupo esperan a la
 * próxima pasada en vez de llegar antes que él.
 */
export function orderGroupOf(item: QueuedSyncItem): string | null {
  if (item.type !== 'ATTENDANCE') return null;
  const pickerId = (item.payload as { picker_id?: unknown }).picker_id;
  return typeof pickerId === 'string' ? `ATTENDANCE:${pickerId}` : null;
}

/** Tipo que esta versión no sabe procesar: a la dead letter queue con el motivo */
async function deadLetterUnknownType(deps: QueuePassDeps, item: QueuedSyncItem): Promise<boolean> {
  // Cola de otra versión de la app, dato corrupto: antes se borraba sin dejar
  // rastro. Reintentarlo no lo arregla.
  const unknownType = String((item as { type: unknown }).type);
  logger.warn(`[SyncService] Unknown item type: ${unknownType} → dead letter`);
  return deps.moveToDeadLetter(item, `unknown_type: ${unknownType}`, 'UNKNOWN_TYPE', 0);
}

/** Agotó los reintentos: conflicto pendiente + dead letter queue. true si salió de la cola */
async function giveUp(
  deps: QueuePassDeps,
  item: QueuedSyncItem,
  error: unknown,
  category: SyncErrorCategory,
  retryCount: number
): Promise<boolean> {
  logger.error(`[SyncService] Giving up on item ${item.id} after ${retryCount} retries (${category}).`);
  await conflictService.detect(
    item.type.toLowerCase(),
    item.id,
    toNZST(new Date(item.timestamp)),
    nowNZST(),
    item.payload,
    { error: 'max_retries_exceeded', category, retryCount }
  );
  const moved = await deps.moveToDeadLetter(
    item,
    `${category}: max retries exceeded`,
    error instanceof Error ? error.message : String(error),
    retryCount
  );
  // 🔧 V28: solo se borra de sync_queue si entró en la DLQ
  if (moved) analytics.trackDLQError(category, retryCount > 30 ? 'critical' : 'high');
  return moved;
}

async function handleFailure(
  deps: QueuePassDeps,
  item: QueuedSyncItem,
  error: unknown,
  state: PassState
): Promise<FailureOutcome> {
  // Rechazo definitivo del servidor: a la cola de fallidos con su motivo, ya
  if (isSyncRejected(error)) {
    logger.warn(`[SyncService] Item ${item.id} rejected by the server: ${error.message}`);
    state.consecutiveNetworkErrors = 0;
    const moved = await deps.moveToDeadLetter(item, error.message, 'REJECTED', item.retryCount + 1);
    return moved ? 'removed' : 'kept';
  }

  const category = deps.categorizeError(error);
  logger.error(`[SyncService] Failed to sync item ${item.id} (${category})`, error);

  // 🔧 U2: sin red se corta la pasada (no tiene sentido seguir). Con red
  // ("online" pero la petición falló) cuenta como un reintento y se sigue
  // con los de detrás; tres fallos de red seguidos cortan la pasada. Antes se
  // cortaba siempre y sin límite: un elemento que fallaba con un mensaje con
  // "fetch" bloqueaba toda la cola para siempre.
  if (category === 'network') {
    state.consecutiveNetworkErrors++;
    if (!navigator.onLine || state.consecutiveNetworkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
      logger.warn('[SyncService] Network down — aborting queue processing');
      await db.sync_queue.update(item.id, { retryCount: item.retryCount + 1 });
      return 'stop';
    }
  } else {
    state.consecutiveNetworkErrors = 0;
  }

  const newRetryCount = item.retryCount + 1;
  if (newRetryCount < maxRetriesFor(category)) {
    await db.sync_queue.update(item.id, { retryCount: newRetryCount });
    return 'kept';
  }
  return (await giveUp(deps, item, error, category, newRetryCount)) ? 'removed' : 'kept';
}

export async function runQueuePass(deps: QueuePassDeps): Promise<void> {
  const syncStartTime = Date.now(); // M-3: hora real de inicio para analytics
  const queue = await deps.getQueue();
  if (queue.length === 0) return;
  // Zod (~45 KB gzip) solo se carga cuando hay algo que sincronizar, no en el arranque
  const schemas = await import('../sync.schemas');

  const processedIds: string[] = [];
  const state: PassState = { consecutiveNetworkErrors: 0, blockedGroups: new Set() };

  for (const item of queue) {
    const group = orderGroupOf(item);
    if (group && state.blockedGroups.has(group)) continue;
    try {
      if (await dispatchSyncItem(item, schemas)) {
        processedIds.push(item.id);
        state.consecutiveNetworkErrors = 0;
      } else if (await deadLetterUnknownType(deps, item)) {
        processedIds.push(item.id);
      }
    } catch (e) {
      const outcome = await handleFailure(deps, item, e, state);
      if (outcome === 'stop') break;
      if (outcome === 'removed') processedIds.push(item.id);
      else if (group) state.blockedGroups.add(group);
    }
  }

  if (processedIds.length === 0) return;
  await db.sync_queue.bulkDelete(processedIds);
  await deps.setLastSyncTime();
  // 📊 PostHog: lote sincronizado y duración real
  analytics.trackSync(processedIds.length, Date.now() - syncStartTime, true);
}
