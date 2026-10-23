/**
 * Anomaly Dismissals Repository — tabla anomaly_dismissals (migración 20261023045000).
 * El manager descarta una anomalía concreta como falsa alarma; no vuelve a salir.
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

export interface AnomalyDismissalRow {
    id: string;
    orchard_id: string;
    anomaly_key: string;
    anomaly_type: string;
    picker_id: string | null;
    picker_name: string | null;
    detail: string | null;
    anomaly_at: string | null;
    reason: string | null;
    dismissed_by: string;
    dismissed_at: string;
}

const COLUMNS = 'id, orchard_id, anomaly_key, anomaly_type, picker_id, picker_name, detail, anomaly_at, reason, dismissed_by, dismissed_at';

export const anomalyDismissalsRepository = {
    /** Descartes del huerto desde una fecha (los de hoy, para la pantalla) */
    async listSince(orchardId: string, sinceIso: string): Promise<AnomalyDismissalRow[]> {
        const rows = await fetchAllRows<AnomalyDismissalRow>((from, to) => supabase
            .from('anomaly_dismissals')
            .select(COLUMNS)
            .eq('orchard_id', orchardId)
            .gte('dismissed_at', sinceIso)
            .order('id')
            .range(from, to));
        return [...rows].sort((a, b) => b.dismissed_at.localeCompare(a.dismissed_at));
    },

    async insert(row: Omit<AnomalyDismissalRow, 'id' | 'dismissed_by' | 'dismissed_at'>): Promise<AnomalyDismissalRow> {
        const { data, error } = await supabase.from('anomaly_dismissals').insert(row).select(COLUMNS).single();
        if (error) throw error;
        return data as AnomalyDismissalRow;
    },

    async remove(id: string): Promise<void> {
        const { data, error } = await supabase.from('anomaly_dismissals').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Dismissal not removed (no permission or not found)');
    },
};
