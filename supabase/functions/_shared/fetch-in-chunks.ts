/**
 * Consultas con una lista larga de ids (`.in('id', ids)`), por trozos y paginadas.
 * Misma idea que src/utils/fetchInChunks.ts (el cliente).
 *
 * La lista va en la URL: con ~200 UUIDs la petición pasa de 8 KB y Kong responde
 * 414. calculate-payroll pedía los nombres de todas las personas de la semana
 * de una vez: con 250 personas la nómina salía sin nombres (prueba de carga
 * 2026-10-21).
 */
import { fetchAllRows } from './fetch-all-rows.ts'

export const IN_CHUNK_SIZE = 100

export async function fetchInChunks<T>(
    ids: readonly string[],
    page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    chunkSize = IN_CHUNK_SIZE,
): Promise<T[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    const chunks: string[][] = []
    for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize))
    const parts = await Promise.all(chunks.map(chunk => fetchAllRows<T>((from, to) => page(chunk, from, to))))
    return parts.flat()
}
