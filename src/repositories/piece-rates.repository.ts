/**
 * Precio por cubeta por día, huerto y variedad (tabla piece_rates, migración
 * 20261023020000). Decisión del dueño 2026-10-23: cambiar el precio hoy solo
 * cuenta desde hoy, para ese huerto y esa variedad; los días anteriores
 * conservan el suyo. El precio de una cubeta lo decide pieceRateOn (pay.ts).
 *
 * Para pagar un rango [from, to] se cargan las filas fijadas dentro del rango
 * y la última de cada (huerto, variedad) anterior al inicio
 * (piece_rates_as_of(from)): así el primer día tiene su precio aunque se
 * fijara semanas antes. Mismo criterio que supabase/functions/_shared/piece-rates.ts.
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { addDaysYMD, todayNZST } from '@/utils/nzst';
import type { DailyPieceRate } from '@/services/harvestMetrics/pay';

export interface PieceRateRow {
    id: string;
    orchard_id: string;
    variety: string | null;
    effective_date: string;
    piece_rate: number | string;
    set_by?: string | null;
    updated_at?: string | null;
}

const COLUMNS = 'id, orchard_id, variety, effective_date, piece_rate, set_by, updated_at';

export function toDailyPieceRate(r: PieceRateRow): DailyPieceRate {
    return {
        orchardId: r.orchard_id,
        variety: r.variety,
        effectiveDate: String(r.effective_date).slice(0, 10),
        pieceRate: Number(r.piece_rate),
    };
}

const sameVariety = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Filas de piece_rates que deciden el precio de cada día del rango */
async function loadRows(from: string, to: string, orchardId?: string): Promise<PieceRateRow[]> {
    const { data: asOf, error } = await supabase.rpc('piece_rates_as_of', {
        p_date: from,
        p_orchard_ids: orchardId ? [orchardId] : null,
    });
    if (error) throw new Error(error.message);
    const inRange = await fetchAllRows<PieceRateRow>((a, b) => {
        let q = supabase
            .from('piece_rates')
            .select(COLUMNS)
            .gt('effective_date', from)
            .lte('effective_date', to);
        if (orchardId) q = q.eq('orchard_id', orchardId);
        return q.order('id').range(a, b);
    });
    return [...((asOf ?? []) as PieceRateRow[]), ...inRange];
}

export interface PieceRatesForRange {
    /** Precios por día (para pieceRateOn) */
    rates: DailyPieceRate[];
    /** harvest_settings.piece_rate de cada huerto: el fallback si un huerto no tiene ninguno */
    orchardFallbacks: Record<string, number>;
}

export const pieceRatesRepository = {
    /** Precios que valen en algún día de [from, to] (de todos los huertos o de uno) */
    async loadRange(from: string, to: string, orchardId?: string): Promise<DailyPieceRate[]> {
        return (await loadRows(from, to, orchardId)).map(toDailyPieceRate);
    },

    /** Precios del rango + el precio general guardado de cada huerto */
    async loadForPay(from: string, to: string): Promise<PieceRatesForRange> {
        const [rates, { data: settings }] = await Promise.all([
            this.loadRange(from, to),
            supabase.from('harvest_settings').select('orchard_id, piece_rate'),
        ]);
        const orchardFallbacks: Record<string, number> = {};
        for (const s of (settings ?? []) as { orchard_id: string; piece_rate: number | null }[]) {
            if (s.piece_rate != null) orchardFallbacks[s.orchard_id] = Number(s.piece_rate);
        }
        return { rates, orchardFallbacks };
    },

    /** Filas del huerto de los últimos `days` días (y la vigente antes), para el historial */
    async loadHistory(orchardId: string, days: number, today: string = todayNZST()): Promise<PieceRateRow[]> {
        return loadRows(addDaysYMD(today, -days), today, orchardId);
    },

    /**
     * Fija el precio de HOY (día NZ) de una variedad (null = general del huerto).
     * Solo cambia el pago desde hoy: los días anteriores conservan su precio.
     */
    async setForDay(orchardId: string, variety: string | null, pieceRate: number, day: string = todayNZST()): Promise<void> {
        const v = variety?.trim() || null;
        let q = supabase.from('piece_rates').select('id, variety').eq('orchard_id', orchardId).eq('effective_date', day);
        q = v === null ? q.is('variety', null) : q.ilike('variety', v);
        const { data: existing, error: findErr } = await q;
        if (findErr) throw new Error(findErr.message);
        const id = ((existing ?? []) as { id: string; variety: string | null }[]).find(r => sameVariety(r.variety, v))?.id;
        const { error } = id
            ? await supabase.from('piece_rates').update({ piece_rate: pieceRate }).eq('id', id)
            : await supabase.from('piece_rates').insert({ orchard_id: orchardId, variety: v, effective_date: day, piece_rate: pieceRate });
        if (error) throw new Error(error.message);
    },

    /** Quita el precio fijado HOY para una variedad: vuelve a valer el anterior (o el general) */
    async clearForDay(orchardId: string, variety: string, day: string = todayNZST()): Promise<void> {
        const { data: existing, error: findErr } = await supabase
            .from('piece_rates')
            .select('id, variety')
            .eq('orchard_id', orchardId)
            .eq('effective_date', day)
            .ilike('variety', variety.trim());
        if (findErr) throw new Error(findErr.message);
        const ids = ((existing ?? []) as { id: string; variety: string | null }[])
            .filter(r => sameVariety(r.variety, variety))
            .map(r => r.id);
        if (ids.length === 0) return;
        const { error } = await supabase.from('piece_rates').delete().in('id', ids);
        if (error) throw new Error(error.message);
    },

    /**
     * Variedades distintas de las filas del huerto (block_rows) de su temporada
     * ACTIVA: las de temporadas cerradas ya no se cosechan y no llevan precio hoy.
     */
    async loadOrchardVarieties(orchardId: string): Promise<string[]> {
        const rows = await fetchAllRows<{ id: string; variety: string | null }>((a, b) => supabase
            .from('block_rows')
            .select('id, variety, orchard_blocks!inner(orchard_id, deleted_at, harvest_seasons!inner(status))')
            .eq('orchard_blocks.orchard_id', orchardId)
            .is('orchard_blocks.deleted_at', null)
            .eq('orchard_blocks.harvest_seasons.status', 'active')
            .is('deleted_at', null)
            .order('id')
            .range(a, b));
        const names = new Map<string, string>();
        for (const r of rows) {
            const v = r.variety?.trim();
            if (v && !names.has(v.toLowerCase())) names.set(v.toLowerCase(), v);
        }
        return [...names.values()].sort((a, b) => a.localeCompare(b));
    },
};
