import Dexie, { Table } from 'dexie';
import { HarvestSettings, Picker } from '../types';
import { snapshotPending, saveRescue, restorePending, countRows } from './dbRescue';

export interface QueuedBucket {
  id: string; // UUID from Store
  picker_id: string; // The UUID
  orchard_id: string; // CRUCIAL: No olvidar este campo
  quality_grade: 'A' | 'B' | 'C' | 'reject';
  timestamp: string;
  synced: number; // 0 = pending, 1 = synced, -1 = error
  scanned_by: string; // 🔧 V17: Who scanned this bucket (user UUID) — prevents authorship fraud
  row_number?: number;
  bin_id?: string;
  failure_reason?: string;
  /** Corrección (ms) ya sumada a timestamp por el desfase del reloj del móvil */
  clock_skew_ms?: number;
}

export interface QueuedMessage {
  id: string; // UUID
  channel_type: 'direct' | 'group' | 'team';
  recipient_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
  synced: number; // 0 = pending, 1 = synced, -1 = error
  priority?: string;
  failure_reason?: string;
}

export interface CachedUser {
  id: string; // usually 'current' or 'roster_ORCHARDID'
  profile?: Picker; // Full user object (optional if storing roster)
  roster?: Picker[]; // Full roster list (optional if storing single user)
  orchard_id: string;
  timestamp: number;
}

export interface CachedSettings {
  id: string; // usually 'current'
  settings: HarvestSettings;
  timestamp: number;
}

export interface DeadLetterItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  failureReason: string;
  errorCode?: string;
  movedAt: number; // when the item was moved to DLQ
}

/** 🔧 M-5 Fix: Typed cache for bucket runners (was `unknown`). Shape mirrors RunnerData. */
export interface CachedRunner {
  id: string;
  name: string;
  avatar: string;
  startTime: string;
  status: 'Active' | 'Break' | 'Off Duty';
  bucketsHandled: number;
  binsCompleted: number;
  currentRow?: number;
}

/** Sync queue item — replaces localStorage queue (audit fix: no 5MB limit) */
export interface QueuedSyncItem {
  id: string;
  type:
    | 'SCAN'
    /** Antiguo (sin procesador desde 2026-10-23): si queda alguno va a fallidos */
    | 'MESSAGE'
    | 'ATTENDANCE'
    | 'ASSIGNMENT'
    | 'CONTRACT'
    | 'TRANSPORT'
    | 'TIMESHEET'
    | 'PICKER'
    | 'QC_INSPECTION'
    | 'UNLINK'
    | 'LEAVE_REQUEST';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  updated_at?: string;
}

/** Metadata for sync state (last sync time, crypto salt, etc.) */
export interface SyncMeta {
  id: string;
  /** number for timestamps, string for crypto salt storage */
  value: number | string;
}

/**
 * Perfil de autenticación cacheado — fallback cuando Supabase devuelve 504/PGRST003.
 * TTL: 7 días. Se limpia automáticamente en signOut (db.delete()).
 * No se encripta: solo contiene role/name/email, sin datos sensibles de nómina.
 */
export interface CachedAuthProfile {
  id: string;                        // userId (UUID)
  profile: Record<string, unknown>;  // Fila raw de users table
  orchard_id: string | null;
  cached_at: number;                 // Date.now() para calcular TTL
}

/** Conflict records — replaces localStorage conflict storage */
export interface StoredConflict {
  id: string;
  table: string;
  record_id: string;
  local_updated_at: string;
  server_updated_at: string;
  local_values: Record<string, unknown>;
  server_values: Record<string, unknown>;
  resolution: 'pending' | 'keep_local' | 'keep_server' | 'merged';
  detected_at: string;
}

export class HarvestDB extends Dexie {
  bucket_queue!: Table<QueuedBucket, string>;
  message_queue!: Table<QueuedMessage, string>;
  user_cache!: Table<CachedUser, string>;
  settings_cache!: Table<CachedSettings, string>;
  /** 🔧 M-5 Fix: properly typed (was Table<unknown, string>) */
  runners_cache!: Table<CachedRunner, string>;
  dead_letter_queue!: Table<DeadLetterItem, string>;
  sync_queue!: Table<QueuedSyncItem, string>;
  sync_meta!: Table<SyncMeta, string>;
  sync_conflicts!: Table<StoredConflict, string>;
  /** Perfil de auth cacheado — fallback offline cuando Supabase da 504/PGRST003 */
  auth_cache!: Table<CachedAuthProfile, string>;

  constructor() {
    super('HarvestProDB');
    this.version(3).stores({
      bucket_queue: 'id, picker_id, orchard_id, synced',
      message_queue: 'id, recipient_id, synced',
      user_cache: 'id',
      settings_cache: 'id',
      runners_cache: 'id',
    });
    // v4: compound indexes for high-volume queries (450+ pickers, ~20k+ buckets)
    this.version(4).stores({
      bucket_queue:
        'id, picker_id, orchard_id, synced, [orchard_id+synced], [picker_id+synced], timestamp',
      message_queue: 'id, recipient_id, synced, [recipient_id+synced], timestamp',
      user_cache: 'id',
      settings_cache: 'id',
      runners_cache: 'id',
    });
    // v5: persistent Dead Letter Queue for failed sync items
    this.version(5).stores({
      bucket_queue:
        'id, picker_id, orchard_id, synced, [orchard_id+synced], [picker_id+synced], timestamp',
      message_queue: 'id, recipient_id, synced, [recipient_id+synced], timestamp',
      user_cache: 'id',
      settings_cache: 'id',
      runners_cache: 'id',
      dead_letter_queue: 'id, type, timestamp, movedAt',
    });
    // v6: Migrate sync queue + conflicts from localStorage to IndexedDB
    // (Audit fix: eliminates 5MB limit, async I/O, no UI thread blocking)
    this.version(6).stores({
      bucket_queue:
        'id, picker_id, orchard_id, synced, [orchard_id+synced], [picker_id+synced], timestamp',
      message_queue: 'id, recipient_id, synced, [recipient_id+synced], timestamp',
      user_cache: 'id',
      settings_cache: 'id',
      runners_cache: 'id',
      dead_letter_queue: 'id, type, timestamp, movedAt',
      sync_queue: 'id, type, timestamp, retryCount',
      sync_meta: 'id',
      sync_conflicts: 'id, table, record_id, resolution, detected_at',
    });
    // 🔧 V17: Add scanned_by to bucket_queue index + recovery table (V11)
    this.version(7).stores({
      bucket_queue:
        'id, picker_id, orchard_id, synced, scanned_by, [orchard_id+synced], [picker_id+synced], timestamp',
      message_queue: 'id, recipient_id, synced, [recipient_id+synced], timestamp',
      user_cache: 'id',
      settings_cache: 'id',
      runners_cache: 'id',
      dead_letter_queue: 'id, type, timestamp, movedAt',
      sync_queue: 'id, type, timestamp, retryCount',
      sync_meta: 'id',
      sync_conflicts: 'id, table, record_id, resolution, detected_at',
      recovery: 'id, timestamp',
    });
    // v8: auth_cache — solo declarar la tabla NUEVA (Dexie solo necesita el delta,
    // no re-declarar tablas existentes — hacerlo causa UpgradeError al comparar keyPaths)
    this.version(8).stores({
      auth_cache: 'id, cached_at',
    });
  }
}

export const db = new HarvestDB();

/**
 * Lo rescatado en un reinicio anterior vuelve a la cola antes de que la app
 * use la BD (Dexie espera a esta promesa antes de servir otras consultas).
 */
db.on('ready', async () => {
  try {
    const restored = await restorePending(db);
    if (restored > 0) {
      console.warn(`[HarvestProDB] ${restored} pending item(s) restored after a local database reset`);
    }
  } catch (err) {
    // El rescate se conserva y se reintenta en el próximo arranque
    console.error('[HarvestProDB] Could not put back the rescued items yet:', err);
  }
});

/**
 * Recuperación automática de schema corrupto.
 *
 * Si el upgrade de Dexie falla (UpgradeError / DatabaseClosedError), el IndexedDB
 * queda bloqueado y TODOS los accesos futuros fallan en cascada.
 * Solución: borrar la DB local y recargar. Antes de borrar se copia lo que no
 * se ha subido (cubos, mensajes, cola de sync, dead letters y la sal del cifrado)
 * a la BD HarvestProRescue; al volver a abrir, db.on('ready') lo restaura.
 * Si no se puede guardar el rescate y había algo pendiente, NO se borra: es
 * mejor una app que no arranca que perder escaneos (= horas de paga).
 */
db.open().catch(async (err: unknown) => {
  const name = (err as { name?: string })?.name ?? '';
  const innerName = (err as { inner?: { name?: string } })?.inner?.name ?? '';
  const isUpgradeError =
    name === 'UpgradeError' ||
    name === 'DatabaseClosedError' ||
    innerName === 'UpgradeError';

  if (isUpgradeError) {
    console.error('[HarvestProDB] Schema upgrade failed — rescuing pending items, then resetting the local database:', err);
    let pending = 0;
    try {
      const snapshot = await snapshotPending('HarvestProDB');
      pending = countRows(snapshot);
      await saveRescue(snapshot);
    } catch (rescueErr) {
      if (pending > 0) {
        console.error(`[HarvestProDB] Could not save ${pending} pending item(s) — keeping the local database:`, rescueErr);
        return;
      }
      console.error('[HarvestProDB] Rescue failed (nothing pending was found):', rescueErr);
    }
    try {
      await Dexie.delete('HarvestProDB');
    } catch (deleteErr) {
      console.error('[HarvestProDB] No se pudo borrar la DB:', deleteErr);
    }
    // Recargar para que Dexie intente abrir con la DB limpia
    window.location.reload();
  }
});

/**
 * Initialize crypto subsystem — call on app startup if desired.
 * Pre-derives the Web Crypto key so subsequent operations are fast.
 * Implementation moved to dbCrypto.ts to avoid circular imports.
 * @see dbCrypto.ts#initCrypto
 */
export { initCrypto } from './dbCrypto';
