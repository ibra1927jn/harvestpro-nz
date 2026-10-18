/**
 * Rescate de la cola local cuando hay que reiniciar IndexedDB.
 *
 * Si falla la actualización del esquema de Dexie, db.ts borra HarvestProDB
 * para que la app vuelva a arrancar. Antes se perdía todo lo que no se había
 * subido (escaneos de cubos hechos sin cobertura = horas de paga).
 *
 * Ahora, antes de borrar:
 *   1. snapshotPending() abre la BD tal como está (sin esquema) y copia lo
 *      pendiente: cubos y mensajes sin sincronizar (synced !== 1), toda la cola
 *      de sync, la dead letter queue, la tabla recovery y la sal del cifrado
 *      (sin ella los campos cifrados de esos registros no se podrían leer).
 *   2. saveRescue() lo guarda en otra BD, HarvestProRescue, que no se borra.
 *   3. Tras recargar, restorePending() lo vuelve a meter en la BD nueva antes
 *      de que la app la use (db.on('ready')) y borra el rescate.
 */
import Dexie from 'dexie';

export const RESCUE_DB_NAME = 'HarvestProRescue';
const RESCUE_ID = 'pending';
/** Clave de la sal del cifrado en sync_meta (dbCrypto.ts) */
export const SALT_META_ID = 'crypto_salt_v3';

type Row = Record<string, unknown> & { id?: unknown };

export interface RescueSnapshot {
  savedAt: string;
  tables: Record<string, Row[]>;
}

/** Tablas cuyo contenido entero es trabajo pendiente */
const KEEP_ALL = ['sync_queue', 'dead_letter_queue', 'recovery'];
/** Tablas con flag synced: se guarda solo lo que no se subió */
const KEEP_UNSYNCED = ['bucket_queue', 'message_queue'];

const isSynced = (row: Row): boolean => row.synced === 1 || row.synced === true;

function rescueDb(): Dexie {
  const d = new Dexie(RESCUE_DB_NAME);
  d.version(1).stores({ items: 'id' });
  return d;
}

export function countRows(snapshot: RescueSnapshot): number {
  return Object.entries(snapshot.tables)
    .filter(([table]) => table !== 'sync_meta')
    .reduce((n, [, rows]) => n + rows.length, 0);
}

/** Copia lo pendiente de la BD dañada, abriéndola sin declarar esquema */
export async function snapshotPending(dbName: string): Promise<RescueSnapshot> {
  const tables: Record<string, Row[]> = {};
  const raw = new Dexie(dbName);
  try {
    await raw.open();
    const names = new Set(raw.tables.map(t => t.name));
    for (const name of KEEP_ALL) {
      if (names.has(name)) tables[name] = (await raw.table(name).toArray()) as Row[];
    }
    for (const name of KEEP_UNSYNCED) {
      if (names.has(name))
        tables[name] = ((await raw.table(name).toArray()) as Row[]).filter(r => !isSynced(r));
    }
    if (names.has('sync_meta')) {
      const salt = (await raw.table('sync_meta').get(SALT_META_ID)) as Row | undefined;
      if (salt) tables.sync_meta = [salt];
    }
  } finally {
    raw.close();
  }
  return { savedAt: new Date().toISOString(), tables };
}

/** Guarda el rescate; si ya había uno sin restaurar, junta los dos */
export async function saveRescue(snapshot: RescueSnapshot): Promise<void> {
  const d = rescueDb();
  try {
    const previous = (await d.table('items').get(RESCUE_ID)) as
      | (RescueSnapshot & { id: string })
      | undefined;
    const merged: RescueSnapshot = previous ? mergeSnapshots(previous, snapshot) : snapshot;
    await d.table('items').put({ id: RESCUE_ID, ...merged });
  } finally {
    d.close();
  }
}

export async function loadRescue(): Promise<RescueSnapshot | null> {
  const d = rescueDb();
  try {
    const row = (await d.table('items').get(RESCUE_ID)) as
      | (RescueSnapshot & { id: string })
      | undefined;
    if (!row) return null;
    return { savedAt: row.savedAt, tables: row.tables };
  } finally {
    d.close();
  }
}

export async function clearRescue(): Promise<void> {
  const d = rescueDb();
  try {
    await d.table('items').delete(RESCUE_ID);
  } finally {
    d.close();
  }
}

function mergeSnapshots(a: RescueSnapshot, b: RescueSnapshot): RescueSnapshot {
  const tables: Record<string, Row[]> = { ...a.tables };
  for (const [name, rows] of Object.entries(b.tables)) {
    const byId = new Map((tables[name] ?? []).map(r => [String(r.id), r]));
    for (const r of rows) byId.set(String(r.id), r);
    tables[name] = [...byId.values()];
  }
  return { savedAt: b.savedAt, tables };
}

/**
 * Vuelve a meter el rescate en la BD ya abierta. La sal solo se pone si la BD
 * no tiene una (BD recién creada), para que los campos cifrados se lean igual.
 * Devuelve cuántos registros se restauraron (sin contar la sal).
 */
export async function restorePending(target: Dexie): Promise<number> {
  const snapshot = await loadRescue();
  if (!snapshot) return 0;
  const names = new Set(target.tables.map(t => t.name));
  const tables = Object.keys(snapshot.tables).filter(n => names.has(n));
  await target.transaction('rw', tables, async () => {
    for (const name of tables) {
      const rows = snapshot.tables[name];
      if (!rows.length) continue;
      if (name === 'sync_meta') {
        const existing = await target.table(name).get(SALT_META_ID);
        if (!existing) await target.table(name).bulkPut(rows);
        continue;
      }
      await target.table(name).bulkPut(rows);
    }
  });
  await clearRescue();
  return countRows(snapshot);
}
