/**
 * Aviso cuando cambia la base de datos local (Dexie), en vez de consultarla cada pocos segundos.
 *
 * Dexie emite 'storagemutated' en cada escritura (también desde otras pestañas). Los avisos
 * seguidos se agrupan en uno (debounce) y, por si acaso, se repite cada `fallbackMs` aunque
 * no haya cambios (p. ej. para refrescar textos tipo "sincronizado hace X").
 */
import Dexie from 'dexie';

export function onLocalDbChange(
  callback: () => void,
  { debounceMs = 300, fallbackMs = 60_000 }: { debounceMs?: number; fallbackMs?: number } = {}
): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;
  const onMutated = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      callback();
    }, debounceMs);
  };
  Dexie.on.storagemutated.subscribe(onMutated);
  const fallback = setInterval(callback, fallbackMs);
  return () => {
    Dexie.on.storagemutated.unsubscribe(onMutated);
    clearInterval(fallback);
    if (pending) clearTimeout(pending);
  };
}
