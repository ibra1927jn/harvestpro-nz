import { fetchAllRows } from './fetchAllRows';

/**
 * Consultas con una lista larga de ids (`.in('picker_id', ids)`).
 *
 * La lista va en la URL: con ~200 UUIDs la petición pasa de 8 KB y el servidor
 * responde 414 (URI too long); el repositorio recibía `data: null` y la pantalla
 * se quedaba sin datos sin avisar (RRHH con 280 personas veía a todos sin
 * contrato; prueba de carga 2026-10-21). Además cada trozo puede devolver más
 * de 1000 filas (cubetas de un día), así que también se pagina.
 *
 * `page(ids, from, to)` construye la consulta completa para ese trozo de ids,
 * con un orden estable, y termina en `.range(from, to)`.
 */
export const IN_CHUNK_SIZE = 100;

export async function fetchInChunks<T>(
    ids: readonly string[],
    page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    chunkSize = IN_CHUNK_SIZE,
): Promise<T[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));
    const parts = await Promise.all(chunks.map(chunk => fetchAllRows<T>((from, to) => page(chunk, from, to))));
    return parts.flat();
}
