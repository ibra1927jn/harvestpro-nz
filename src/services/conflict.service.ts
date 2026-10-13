/**
 * Conflict Resolution Service
 * ============================
 * Detects and logs sync conflicts when offline changes
 * collide with server-side changes.
 *
 * Strategy:
 * - INSERT operations (bucket scans) → no conflicts possible (append-only + 23505 dedup)
 * - UPDATE operations (picker status, attendance) → check updated_at before applying
 * - Conflicts are logged to IndexedDB and optionally synced to audit_logs
 *
 * Storage: Dexie.js (IndexedDB) — replaces localStorage (audit fix: no 5MB limit)
 */

import { logger } from '@/utils/logger';
import { nowNZST } from '@/utils/nzst';
import { safeUUID } from '@/utils/uuid';
import { db } from './db';
import { analytics } from '@/config/analytics';
import type { StoredConflict } from './db';
import type { PendingItem, SyncPayload } from './sync-processors';

// Re-export for backwards compatibility
export type SyncConflict = StoredConflict;

// ============================================
// CONSTANTS
// ============================================

const MAX_STORED_CONFLICTS = 50;

// 🔧 M-2 Fix: Map SQL table names → sync queue action types.
// Used by conflictService.resolve('keep_local') to re-queue local changes.
// NOTE: 'timesheets' was removed — timesheet processor uses table: 'daily_attendance'
//       internally (via optimistic lock on attendance records). Approval conflicts
//       should always resolve as 'keep_server' — supervisor approvals are authoritative.
const TABLE_TO_SYNC_TYPE: Record<string, PendingItem['type']> = {
  daily_attendance: 'ATTENDANCE',
  bucket_records: 'SCAN',
  contracts: 'CONTRACT',
  transport_requests: 'TRANSPORT',
  pickers: 'PICKER',
  qc_inspections: 'QC_INSPECTION',
  messages: 'MESSAGE',
};

// ============================================
// PUBLIC API
// ============================================

export const conflictService = {
  /**
   * Check if a local update conflicts with server state.
   * Returns the conflict if detected, null if safe to proceed.
   *
   * @param table - DB table name (e.g. 'pickers', 'daily_attendance')
   * @param recordId - UUID of the record
   * @param localUpdatedAt - Timestamp when local change was made
   * @param serverUpdatedAt - Timestamp from the server's current version
   * @param localValues - The values the client wants to write
   * @param serverValues - The current values on the server
   */
  async detect(
    table: string,
    recordId: string,
    localUpdatedAt: string,
    serverUpdatedAt: string,
    localValues: Record<string, unknown>,
    serverValues: Record<string, unknown>
  ): Promise<SyncConflict | null> {
    const localTime = new Date(localUpdatedAt).getTime();
    const serverTime = new Date(serverUpdatedAt).getTime();

    // 🔧 R9-Fix5: Changed >= to > — same-timestamp is ambiguous and should be treated as conflict
    // No conflict only if local is strictly newer
    if (localTime > serverTime) {
      return null;
    }

    // Server has a newer version — conflict detected
    const conflict: SyncConflict = {
      id: safeUUID(),
      table,
      record_id: recordId,
      local_updated_at: localUpdatedAt,
      server_updated_at: serverUpdatedAt,
      local_values: localValues,
      server_values: serverValues,
      resolution: 'pending',
      detected_at: nowNZST(),
    };

    logger.warn(
      `[ConflictService] ⚠️ Conflict detected on ${table}/${recordId}: ` +
        `local=${localUpdatedAt}, server=${serverUpdatedAt}`
    );

    // Store conflict in IndexedDB
    try {
      await db.sync_conflicts.put(conflict);

      // Trim old conflicts if over limit
      const total = await db.sync_conflicts.count();
      if (total > MAX_STORED_CONFLICTS) {
        const excess = total - MAX_STORED_CONFLICTS;
        const oldest = await db.sync_conflicts.orderBy('detected_at').limit(excess).toArray();
        // 🔧 L29: Prefer evicting resolved conflicts, but force-evict oldest
        // if all are pending — prevents infinite DB growth
        const resolved = oldest.filter(c => c.resolution !== 'pending');
        if (resolved.length > 0) {
          await db.sync_conflicts.bulkDelete(resolved.map(c => c.id));
        } else {
          // All overflow are pending — force-evict the oldest to cap storage
          logger.warn(
            `[ConflictService] Force-evicting ${excess} oldest pending conflicts to prevent storage overflow`
          );
          await db.sync_conflicts.bulkDelete(oldest.map(c => c.id));
        }
      }
    } catch (e) {
      logger.error('[ConflictService] Failed to save conflict to IndexedDB:', e);
    }

    return conflict;
  },

  /**
   * Resolve a conflict with the chosen strategy.
   */
  async resolve(
    conflictId: string,
    resolution: 'keep_local' | 'keep_server' | 'merged'
  ): Promise<SyncConflict | null> {
    try {
      const conflict = await db.sync_conflicts.get(conflictId);
      if (!conflict) {
        logger.warn(`[ConflictService] Conflict ${conflictId} not found`);
        return null;
      }

      conflict.resolution = resolution;
      await db.sync_conflicts.put(conflict);

      // 🔧 U7: If keeping local, re-queue to actually overwrite server
      if (resolution === 'keep_local') {
        const actionType = TABLE_TO_SYNC_TYPE[conflict.table];
        if (actionType) {
          const { syncService } = await import('./sync.service');
          await syncService.addToQueue(actionType, {
            ...conflict.local_values,
            id: conflict.record_id,
          } as unknown as SyncPayload);
          logger.info(
            `[ConflictService] 🔄 Re-queued local values for ${conflict.table}/${conflict.record_id} as ${actionType}`
          );
        } else {
          logger.warn(
            `[ConflictService] ⚠️ No sync type mapping for table "${conflict.table}". ` +
              `Local values NOT re-queued. Add mapping to TABLE_TO_SYNC_TYPE.`
          );
        }
      }

      logger.info(
        `[ConflictService] ✅ Conflict ${conflictId} resolved: ${resolution} ` +
          `(${conflict.table}/${conflict.record_id})`
      );
      // 📊 PostHog: Track conflict resolution
      analytics.trackConflictResolved(conflict.table, resolution);

      return conflict;
    } catch (e) {
      logger.error('[ConflictService] Failed to resolve conflict:', e);
      return null;
    }
  },

  /**
   * Get all pending (unresolved) conflicts.
   */
  async getPendingConflicts(): Promise<SyncConflict[]> {
    try {
      return await db.sync_conflicts.where('resolution').equals('pending').toArray();
    } catch (e) {
      logger.error('[ConflictService] Failed to read pending conflicts:', e);
      return [];
    }
  },

  /**
   * Get all conflicts (for audit/history UI).
   */
  async getAllConflicts(): Promise<SyncConflict[]> {
    try {
      return await db.sync_conflicts.toArray();
    } catch (e) {
      logger.error('[ConflictService] Failed to read conflicts:', e);
      return [];
    }
  },

  /**
   * Get count of pending conflicts (for UI badges).
   */
  async getPendingCount(): Promise<number> {
    try {
      return await db.sync_conflicts.where('resolution').equals('pending').count();
    } catch (e) {
      logger.error('[ConflictService] Failed to count pending conflicts:', e);
      return 0;
    }
  },

  /**
   * Clear resolved conflicts older than N days.
   */
  async cleanup(maxAgeDays: number = 7): Promise<number> {
    try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      // detected_at va en hora NZ con desfase (+13:00): comparar instantes, no textos
      // (comparado como texto contra un ISO en UTC se quedaban 12-13 h de mas)
      const oldResolved = await db.sync_conflicts
        .where('resolution')
        .notEqual('pending')
        .filter(c => Date.parse(c.detected_at) < cutoff)
        .toArray();

      if (oldResolved.length > 0) {
        await db.sync_conflicts.bulkDelete(oldResolved.map(c => c.id));
        logger.info(`[ConflictService] Cleaned up ${oldResolved.length} resolved conflicts`);
      }

      return oldResolved.length;
    } catch (e) {
      logger.error('[ConflictService] Failed to clean up conflicts:', e);
      return 0;
    }
  },

  /**
   * Clear all conflicts (after successful full sync).
   */
  async clearAll(): Promise<void> {
    try {
      await db.sync_conflicts.clear();
    } catch (e) {
      logger.error('[ConflictService] Failed to clear conflicts:', e);
    }
  },
};
