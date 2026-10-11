/**
 * Lee TODAS las filas de una consulta de Supabase, página a página.
 *
 * PostgREST devuelve como máximo 1000 filas por petición (max_rows). Una semana
 * de cubetas pasa de ese límite enseguida, y la consulta se cortaba sin avisar:
 * el informe semanal veía ~1000 cubetas de 2300.
 *
 * `page(from, to)` debe construir la consulta completa (con un orden estable,
 * p. ej. `.order('id')`) y terminar en `.range(from, to)`.
 *
 * Sin imports: se copia tal cual a supabase/functions/_shared/fetch-all-rows.ts.
 */
export async function fetchAllRows<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    pageSize = 1000,
): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await page(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
    }
    return rows;
}
