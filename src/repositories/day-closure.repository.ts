/**
 * Day Closure Repository — tabla day_closures (cierre del día del manager).
 *
 * Una fila por huerto y día (UNIQUE orchard_id, date). status 'closed' bloquea
 * cubetas y fichajes de ese día en la BD; 'open' = reabierto por admin.
 */
import { supabase } from '@/services/supabase';

export interface DayClosureRow {
    id: string;
    orchard_id: string;
    date: string;
    status: 'open' | 'closed';
    closed_by: string | null;
    closed_at: string | null;
}

export interface DayClosureTotals {
    total_buckets: number;
    total_cost: number;
    total_hours: number;
    wage_violations: number;
}

const COLUMNS = 'id, orchard_id, date, status, closed_by, closed_at';

export const dayClosureRepository = {
    /** Cierre de un día (o null si no hay fila). Lanza si la consulta falla. */
    async getForDate(orchardId: string, date: string): Promise<DayClosureRow | null> {
        const { data, error } = await supabase
            .from('day_closures')
            .select(COLUMNS)
            .eq('orchard_id', orchardId)
            .eq('date', date)
            .is('deleted_at', null)
            .maybeSingle();
        if (error) throw error;
        return (data as DayClosureRow | null) ?? null;
    },

    /**
     * Cierra el día. upsert por (huerto, día): si un admin lo reabrió (fila
     * 'open') se vuelve a cerrar en vez de chocar con la clave única.
     */
    async close(orchardId: string, date: string, closedBy: string, totals: DayClosureTotals): Promise<DayClosureRow> {
        const { data, error } = await supabase
            .from('day_closures')
            .upsert({
                orchard_id: orchardId,
                date,
                status: 'closed',
                closed_by: closedBy,
                closed_at: new Date().toISOString(),
                ...totals,
            }, { onConflict: 'orchard_id,date' })
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data as DayClosureRow;
    },
};
