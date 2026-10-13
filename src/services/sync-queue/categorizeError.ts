/**
 * Clasificación de errores de sincronización: network | server | validation | unknown.
 * De la categoría dependen los reintentos antes de la dead letter queue.
 */
export type SyncErrorCategory = 'network' | 'server' | 'validation' | 'unknown';

/** Reintentos por categoría. Red: más margen (horas de mala señal no deben mandar nada a la DLQ) */
export function maxRetriesFor(category: SyncErrorCategory): number {
  if (category === 'validation') return 5;
  if (category === 'network') return 200;
  return 50;
}

/** ZodError sin importar zod (name + issues, como lo construye zod 4). */
export function isZodError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

const NETWORK_WORDS = ['fetch', 'network', 'timeout', 'aborted'];
const VALIDATION_WORDS = ['constraint', 'violat', 'unique', 'foreign key', 'conflict', 'optimistic lock'];

/** Categoría según el texto de un Error (null si el texto no dice nada) */
function categorizeMessage(message: string): SyncErrorCategory | null {
  const msg = message.toLowerCase();
  if (NETWORK_WORDS.some(w => msg.includes(w))) return 'network';
  // Códigos HTTP como palabra: "23503" (clave foránea) contiene "503"
  if (/\b(500|502|503|429)\b/.test(msg)) return 'server';
  // SQLSTATE clase 23 (integridad), no cualquier "23" (LOC-023, fila 23...)
  if (/\b23\d{3}\b/.test(msg) || VALIDATION_WORDS.some(w => msg.includes(w))) return 'validation';
  return null;
}

/** Categoría según el `code` de un error de Supabase/PostgREST */
function categorizeCode(error: unknown): SyncErrorCategory | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = String((error as Record<string, unknown>).code);
  if (code.startsWith('23')) return 'validation';
  // Códigos de PostgREST: PGRST116, PGRST301… (nunca son exactamente 'PGRST')
  if (code.startsWith('PGRST')) return 'server';
  return null;
}

export function categorizeError(error: unknown, online: boolean): SyncErrorCategory {
  if (!online) return 'network';
  // Payload que no pasa el esquema: no se arregla reintentando.
  // Comprobación estructural: zod se carga bajo demanda (sync.schemas.ts)
  if (isZodError(error)) return 'validation';
  const byMessage = error instanceof Error ? categorizeMessage(error.message) : null;
  return byMessage ?? categorizeCode(error) ?? 'unknown';
}
