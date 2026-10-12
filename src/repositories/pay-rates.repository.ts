/**
 * Precios para el pago por cubeta: precio por variedad (variety_rates) y precio
 * normal de cada huerto (harvest_settings.piece_rate). Con pieceRateFor (pay.ts)
 * cada cubeta cobra: variedad en su huerto → variedad en la empresa → huerto.
 */
import { supabase } from '@/services/supabase';

export interface PayRates {
    varietyRates: { orchardId: string | null; variety: string; pieceRate: number }[];
    orchardRates: Record<string, number>;
}

export const payRatesRepository = {
    async load(): Promise<PayRates> {
        const [{ data: varieties }, { data: settings }] = await Promise.all([
            supabase.from('variety_rates').select('orchard_id, variety, piece_rate'),
            supabase.from('harvest_settings').select('orchard_id, piece_rate'),
        ]);
        const orchardRates: Record<string, number> = {};
        for (const s of (settings ?? []) as { orchard_id: string; piece_rate: number | null }[]) {
            if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate);
        }
        return {
            varietyRates: ((varieties ?? []) as { orchard_id: string | null; variety: string; piece_rate: number }[])
                .map(v => ({ orchardId: v.orchard_id, variety: v.variety, pieceRate: Number(v.piece_rate) })),
            orchardRates,
        };
    },
};

/** Nombres de los huertos de la empresa (para el detalle de nómina) */
export async function loadOrchardNames(): Promise<Record<string, string>> {
    const { data } = await supabase.from('orchards').select('id, name');
    const out: Record<string, string> = {};
    for (const o of (data ?? []) as { id: string; name: string | null }[]) out[o.id] = o.name ?? o.id.slice(0, 8);
    return out;
}

export interface OrchardVarietyRate {
    variety: string;
    /** Precio propio del huerto (null = usa el de la empresa o el normal) */
    orchardRate: number | null;
    /** Precio de la empresa para esa variedad, si existe */
    companyRate: number | null;
}

/** Variedades que hay en las filas del huerto, con su precio actual */
export async function loadOrchardVarietyRates(orchardId: string): Promise<OrchardVarietyRate[]> {
    const [{ data: rows }, { data: rates }] = await Promise.all([
        supabase.from('block_rows').select('variety, orchard_blocks!inner(orchard_id)').eq('orchard_blocks.orchard_id', orchardId),
        supabase.from('variety_rates').select('orchard_id, variety, piece_rate').or(`orchard_id.eq.${orchardId},orchard_id.is.null`),
    ]);
    const key = (v: string) => v.trim().toLowerCase();
    const names = new Map<string, string>();
    for (const r of (rows ?? []) as { variety: string | null }[]) if (r.variety) names.set(key(r.variety), r.variety.trim());
    const rateList = (rates ?? []) as { orchard_id: string | null; variety: string; piece_rate: number }[];
    for (const r of rateList) if (!names.has(key(r.variety))) names.set(key(r.variety), r.variety);
    return [...names.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([k, variety]) => ({
            variety,
            orchardRate: rateList.find(r => r.orchard_id === orchardId && key(r.variety) === k)?.piece_rate ?? null,
            companyRate: rateList.find(r => r.orchard_id === null && key(r.variety) === k)?.piece_rate ?? null,
        }));
}

/** Guarda (o quita, con null) el precio de una variedad en un huerto */
export async function saveOrchardVarietyRate(orchardId: string, variety: string, pieceRate: number | null): Promise<void> {
    const { data: existing, error: findErr } = await supabase
        .from('variety_rates')
        .select('id')
        .eq('orchard_id', orchardId)
        .ilike('variety', variety.trim());
    if (findErr) throw new Error(findErr.message);
    const id = (existing ?? [])[0]?.id as string | undefined;
    if (pieceRate === null) {
        if (id) {
            const { error } = await supabase.from('variety_rates').delete().eq('id', id);
            if (error) throw new Error(error.message);
        }
        return;
    }
    const { error } = id
        ? await supabase.from('variety_rates').update({ piece_rate: pieceRate, updated_at: new Date().toISOString() }).eq('id', id)
        : await supabase.from('variety_rates').insert({ orchard_id: orchardId, variety: variety.trim(), piece_rate: pieceRate });
    if (error) throw new Error(error.message);
}
