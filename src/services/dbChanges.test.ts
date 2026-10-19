import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onLocalDbChange } from './dbChanges';

// Escribir en Dexie avisa (agrupado); sin escrituras solo queda el aviso de respaldo
describe('onLocalDbChange', () => {
  const db = new Dexie('dbChangesTest');
  db.version(1).stores({ items: '++id' });
  afterEach(() => vi.useRealTimers());

  it('calls back once after a burst of writes', async () => {
    const cb = vi.fn();
    const stop = onLocalDbChange(cb, { debounceMs: 20, fallbackMs: 60_000 });
    await db.table('items').bulkAdd([{ a: 1 }, { a: 2 }]);
    await db.table('items').add({ a: 3 });
    await new Promise(r => setTimeout(r, 80));
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    await db.table('items').add({ a: 4 });
    await new Promise(r => setTimeout(r, 80));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('without writes, only the slow fallback fires', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const stop = onLocalDbChange(cb, { fallbackMs: 60_000 });
    vi.advanceTimersByTime(59_000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
  });
});
