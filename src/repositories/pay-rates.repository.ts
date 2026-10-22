/**
 * Datos de huertos para la nómina. Los precios por cubeta están en
 * piece-rates.repository.ts (por día, huerto y variedad).
 */
import { supabase } from '@/services/supabase';

/** Nombres de los huertos de la empresa (para el detalle de nómina) */
export async function loadOrchardNames(): Promise<Record<string, string>> {
    const { data } = await supabase.from('orchards').select('id, name');
    const out: Record<string, string> = {};
    for (const o of (data ?? []) as { id: string; name: string | null }[]) out[o.id] = o.name ?? o.id.slice(0, 8);
    return out;
}
