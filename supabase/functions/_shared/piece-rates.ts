/**
 * Precios por cubeta por día (tabla piece_rates, migración 20261023020000).
 * Para pagar un rango [from, to] hacen falta las filas fijadas dentro del rango
 * y la última de cada (huerto, variedad) anterior al inicio (la que vale el
 * primer día si nadie lo cambió): piece_rates_as_of(from) + filas (from, to].
 * Mismo criterio que src/repositories/piece-rates.repository.ts.
 */
import type { DailyPieceRate } from './pay-rules.ts'
import { fetchAllRows } from './fetch-all-rows.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

interface PieceRateRow {
    id: string
    orchard_id: string
    variety: string | null
    effective_date: string
    piece_rate: number | string
}

const toDaily = (r: PieceRateRow): DailyPieceRate => ({
    orchardId: r.orchard_id,
    variety: r.variety,
    effectiveDate: String(r.effective_date).slice(0, 10),
    pieceRate: Number(r.piece_rate),
})

export async function loadDailyPieceRates(supabase: SupabaseLike, from: string, to: string): Promise<DailyPieceRate[]> {
    const { data: asOf, error } = await supabase.rpc('piece_rates_as_of', { p_date: from })
    if (error) throw new Error(`Piece rates: ${error.message}`)
    const inRange = await fetchAllRows<PieceRateRow>((a, b) => supabase
        .from('piece_rates')
        .select('id, orchard_id, variety, effective_date, piece_rate')
        .gt('effective_date', from)
        .lte('effective_date', to)
        .order('id')
        .range(a, b))
    return [...((asOf ?? []) as PieceRateRow[]), ...inRange].map(toDaily)
}
