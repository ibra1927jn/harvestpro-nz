import { logger } from '@/utils/logger';
import { db, QueuedBucket } from './db';
import { toNZST } from '@/utils/nzst';
import { encryptRecord, decryptRecord } from './dbCrypto';

const DAYS_TO_KEEP_SYNCED = 7;

export interface QueueStats {
  pending: number;
  synced: number;
  errors: number;
  oldestPending: string | null;
}

/**
 * Escrituras de escaneos aún en curso (cifrar + guardar). Marcar un escaneo como
 * subido/rechazado espera a que su escritura termine: si no, la marca llegaba
 * antes que el registro, no cambiaba nada, y el registro quedaba "pendiente"
 * para siempre (contador de pendientes atascado hasta reabrir la app).
 */
const inflightWrites = new Map<string, Promise<void>>();

export const offlineService = {
  /**
   * BUCKETS: Main Persistence
   * 🔧 C-1 Fix: Encrypt BEFORE writing to IndexedDB.
   * OLD: Dexie hooks encrypted asynchronously AFTER the write — PII existed
   *      in plaintext for ~ms. If the process died in that window, data was exposed.
   * NEW: encryptRecord() is called here, before db.put() — zero plaintext window.
   */
  async queueBucket(bucket: Omit<QueuedBucket, 'synced'>) {
    const write = this._writeBucket(bucket);
    // whenWritten no debe lanzar (solo espera): el error lo recibe quien encola
    const tracked = write.catch(() => undefined);
    inflightWrites.set(bucket.id, tracked);
    try {
      await write;
    } finally {
      if (inflightWrites.get(bucket.id) === tracked) inflightWrites.delete(bucket.id);
    }
  },

  /** Espera a que termine la escritura en curso de un escaneo (si la hay) */
  async whenWritten(id: string): Promise<void> {
    await inflightWrites.get(id);
  },

  async _writeBucket(bucket: Omit<QueuedBucket, 'synced'>): Promise<void> {
    const record = { ...bucket, synced: 0 };
    try {
      const encryptedBucket = await encryptRecord('bucket_queue', record);
      await db.bucket_queue.put(encryptedBucket);
    } catch (error) {
      logger.error('❌ [Offline] Encryption failed, storing unencrypted:', error);
      // Fallback: store unencrypted rather than lose the record entirely
      try {
        await db.bucket_queue.put(record as QueuedBucket);
      } catch (dbError) {
        logger.error('❌ [Offline] Failed to queue bucket:', dbError);
        // No se guardó: quien llama no debe decir "Saved"
        throw dbError;
      }
    }
  },

  async getPendingBuckets(): Promise<QueuedBucket[]> {
    const rows = await db.bucket_queue.where('synced').equals(0).toArray();
    // Decrypt sensitive fields after read
    return Promise.all(rows.map(b => decryptRecord('bucket_queue', b as unknown as Record<string, unknown>) as unknown as Promise<QueuedBucket>));
  },

  async markAsSynced(id: string) {
    try {
      await this.whenWritten(id);
      await db.bucket_queue.update(id, { synced: 1 });
    } catch (error) {
      logger.error('❌ [Offline] Failed to mark as synced:', error);
    }
  },

  /** Rechazado por el servidor (semana cerrada, tarjeta desconocida…): no se reintenta */
  async markAsFailed(id: string, reason: string) {
    try {
      await this.whenWritten(id);
      await db.bucket_queue.update(id, { synced: -1, failure_reason: reason.slice(0, 500) });
    } catch (error) {
      logger.error('❌ [Offline] Failed to mark as failed:', error);
    }
  },

  async getPendingCount(): Promise<number> {
    return await db.bucket_queue.where('synced').equals(0).count();
  },

  /**
   * CLEANUP: Remove old synced records to save space.
   * 🔧 M-1 Fix: Use indexed Dexie query instead of in-memory .filter().
   * OLD: .filter() loaded ALL records (~20k+) into RAM before filtering by date.
   * NEW: .where('synced').equals(1) uses the `synced` index to pre-filter,
   *      then .and() applies the timestamp check only on the synced subset.
   */
  async cleanupSynced() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - DAYS_TO_KEEP_SYNCED);
    const isoThreshold = toNZST(threshold);

    await db.bucket_queue
      .where('synced').equals(1)
      .and(b => b.timestamp < isoThreshold)
      .delete();
  },

  /**
   * Queue Statistics: pending, synced, errors, oldest pending item
   */
  // 🔧 V10: Use indexed Dexie queries instead of loading all records into memory
  async getQueueStats(): Promise<QueueStats> {
    const [pending, synced, errors] = await Promise.all([
      db.bucket_queue.where('synced').equals(0).count(),
      db.bucket_queue.where('synced').equals(1).count(),
      db.bucket_queue.where('synced').equals(-1).count(),
    ]);

    let oldestPending: string | null = null;
    if (pending > 0) {
      const oldest = await db.bucket_queue
        .where('synced').equals(0)
        .sortBy('timestamp')
        .then(items => items[0] ?? null);  // Dexie sortBy returns array; take first
      if (oldest) {
        oldestPending = oldest.timestamp;
      }
    }

    return {
      pending,
      synced,
      errors,
      oldestPending,
    };
  },

  /**
   * LEGACY STUB: Conflict count (always 0, kept for compatibility)
   */
  getConflictCount: async () => 0,

  /**
   * RETRY: Reset all error items (synced = -1) back to pending (synced = 0)
   * Returns the number of items reset.
   */
  async retryFailedItems(): Promise<number> {
    const errors = await db.bucket_queue.where('synced').equals(-1).toArray();
    if (errors.length === 0) return 0;
    await Promise.all(
      errors.map(item => db.bucket_queue.update(item.id, { synced: 0 }))
    );
    return errors.length;
  },

  /**
   * ERROR ITEMS: List all failed items for debugging
   */
  async getErrorItems(): Promise<QueuedBucket[]> {
    return await db.bucket_queue.where('synced').equals(-1).sortBy('timestamp');
  },

  /**
   * CLEAR ERRORS: Remove error items older than specified hours (default: 24)
   */
  async clearErrorItems(olderThanHours = 24): Promise<number> {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - olderThanHours);
    const isoThreshold = toNZST(threshold);

    const toDelete = await db.bucket_queue
      .where('synced').equals(-1)
      .and(b => b.timestamp < isoThreshold)
      .toArray();

    await Promise.all(toDelete.map(item => db.bucket_queue.delete(item.id)));
    return toDelete.length;
  },
};