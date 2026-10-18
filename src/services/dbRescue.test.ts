/**
 * Reinicio de la BD local sin perder trabajo (auditoría 2026-10-16, hallazgo 6).
 * Antes, si fallaba la actualización del esquema, se borraba HarvestProDB entera
 * con los escaneos que aún no se habían subido.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  snapshotPending,
  saveRescue,
  loadRescue,
  restorePending,
  countRows,
  SALT_META_ID,
  RESCUE_DB_NAME,
} from './dbRescue';

const OLD = 'RescueTestOld';
const NEW = 'RescueTestNew';

async function makeOldPhoneDb(): Promise<void> {
  const d = new Dexie(OLD);
  d.version(1).stores({
    bucket_queue: 'id, synced',
    message_queue: 'id, synced',
    sync_queue: 'id',
    dead_letter_queue: 'id',
    recovery: 'id',
    sync_meta: 'id',
    user_cache: 'id',
  });
  await d.open();
  await d.table('bucket_queue').bulkPut([
    { id: 'b1', picker_id: 'p1', synced: 0, scanned_by: 'enc:xyz' },
    { id: 'b2', picker_id: 'p2', synced: 1 },
    { id: 'b3', picker_id: 'p3', synced: -1, failure_reason: 'archived' },
  ]);
  await d.table('message_queue').bulkPut([
    { id: 'm1', synced: 0 },
    { id: 'm2', synced: 1 },
  ]);
  await d.table('sync_queue').put({ id: 's1', type: 'ATTENDANCE' });
  await d.table('dead_letter_queue').put({ id: 'd1', type: 'SCAN' });
  await d.table('sync_meta').bulkPut([
    { id: SALT_META_ID, value: '1,2,3' },
    { id: 'lastSyncAt', value: 'x' },
  ]);
  await d.table('user_cache').put({ id: 'current', profile: {} });
  d.close();
}

function newDb(): Dexie {
  const d = new Dexie(NEW);
  d.version(1).stores({
    bucket_queue: 'id, synced',
    message_queue: 'id, synced',
    sync_queue: 'id',
    dead_letter_queue: 'id',
    recovery: 'id',
    sync_meta: 'id',
    user_cache: 'id',
  });
  return d;
}

describe('dbRescue', () => {
  beforeEach(async () => {
    await Dexie.delete(OLD);
    await Dexie.delete(NEW);
    await Dexie.delete(RESCUE_DB_NAME);
  });

  it('copies only pending work and the encryption salt', async () => {
    await makeOldPhoneDb();
    const snap = await snapshotPending(OLD);

    expect(snap.tables.bucket_queue.map(r => r.id).sort()).toEqual(['b1', 'b3']);
    expect(snap.tables.message_queue.map(r => r.id)).toEqual(['m1']);
    expect(snap.tables.sync_queue).toHaveLength(1);
    expect(snap.tables.dead_letter_queue).toHaveLength(1);
    expect(snap.tables.sync_meta).toEqual([{ id: SALT_META_ID, value: '1,2,3' }]);
    expect(snap.tables.user_cache).toBeUndefined(); // caché: se vuelve a descargar
    expect(countRows(snap)).toBe(5);
  });

  it('survives the reset: rescued scans are back in the queue of the new database', async () => {
    await makeOldPhoneDb();
    await saveRescue(await snapshotPending(OLD));
    await Dexie.delete(OLD); // lo que hace db.ts tras el fallo

    const fresh = newDb();
    await fresh.open();
    const restored = await restorePending(fresh);

    expect(restored).toBe(5);
    const b1 = await fresh.table('bucket_queue').get('b1');
    expect(b1).toMatchObject({ picker_id: 'p1', synced: 0, scanned_by: 'enc:xyz' });
    expect(await fresh.table('sync_meta').get(SALT_META_ID)).toEqual({
      id: SALT_META_ID,
      value: '1,2,3',
    });
    expect(await loadRescue()).toBeNull(); // se borra una vez restaurado
    fresh.close();
  });

  it('does not overwrite a salt the new database already has', async () => {
    await makeOldPhoneDb();
    await saveRescue(await snapshotPending(OLD));
    const fresh = newDb();
    await fresh.open();
    await fresh.table('sync_meta').put({ id: SALT_META_ID, value: '9,9,9' });

    await restorePending(fresh);

    expect(await fresh.table('sync_meta').get(SALT_META_ID)).toEqual({
      id: SALT_META_ID,
      value: '9,9,9',
    });
    fresh.close();
  });

  it('two resets before restoring keep the items of both', async () => {
    await makeOldPhoneDb();
    await saveRescue(await snapshotPending(OLD));
    await saveRescue({ savedAt: 'later', tables: { bucket_queue: [{ id: 'b9', synced: 0 }] } });

    const rescue = await loadRescue();
    expect(rescue?.tables.bucket_queue.map(r => r.id).sort()).toEqual(['b1', 'b3', 'b9']);
  });

  it('nothing rescued → nothing restored', async () => {
    const fresh = newDb();
    await fresh.open();
    expect(await restorePending(fresh)).toBe(0);
    fresh.close();
  });
});

describe('HarvestProDB wiring', () => {
  it('the app database puts rescued scans back in the queue when it opens', async () => {
    await Dexie.delete('HarvestProDB');
    await saveRescue({
      savedAt: 'now',
      tables: {
        bucket_queue: [
          {
            id: 'rescued-1',
            picker_id: 'p1',
            orchard_id: 'o1',
            synced: 0,
            timestamp: 't',
            quality_grade: 'A',
            scanned_by: 'u',
          },
        ],
      },
    });
    const { db } = await import('./db');
    const row = await db.bucket_queue.get('rescued-1');
    expect(row).toMatchObject({ picker_id: 'p1', synced: 0 });
    expect(await loadRescue()).toBeNull();
  });
});
