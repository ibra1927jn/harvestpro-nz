/**
 * Picker History Repository — Domain queries for picker history data
 * 
 * Extracts all Supabase queries from picker-history.service.ts
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

/** Inspección de un picker (qc_inspections o la tabla antigua, sin criterios) */
export interface PickerInspectionRow {
    quality_grade: string | null;
    created_at: string | null;
    /** {ladder: 'ok'|'warn'|'bad', ...} o null (inspección solo con nota) */
    criteria?: unknown;
    score?: number | null;
    row_number?: number | null;
}

export const pickerHistoryRepository = {
    /** Get picker profile by ID */
    async getPickerById(pickerId: string) {
        const { data, error } = await supabase
            .from('pickers')
            .select('*')
            .eq('id', pickerId)
            .single();
        if (error) return null;
        return data;
    },

    /** Get user's full_name by ID */
    async getUserName(userId: string): Promise<string | null> {
        const { data } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', userId)
            .single();
        return data?.full_name || null;
    },

    /** Get attendance records for a picker since a given date */
    async getAttendanceSince(pickerId: string, sinceDate: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('*')
            .eq('picker_id', pickerId)
            .gte('date', sinceDate)
            .order('date', { ascending: false });
        return data || [];
    },

    /** Get bucket records for a picker since a given ISO timestamp */
    async getBucketRecordsSince(pickerId: string, sinceIso: string) {
        // Paginado: un picker rápido pasa de 1000 cubetas en 14 días
        return fetchAllRows((from, to) =>
            supabase
                .from('bucket_records')
                .select('*')
                .eq('picker_id', pickerId)
                .gte('scanned_at', sinceIso)
                .order('scanned_at', { ascending: false })
                .order('id')
                .range(from, to)
        ).catch(() => []);
    },

    /** Get quality inspections for a picker since a given ISO timestamp */
    async getInspectionsSince(pickerId: string, sinceIso: string): Promise<PickerInspectionRow[]> {
        // Las inspecciones de la app de Calidad están en qc_inspections (columna
        // grade, y desde 2026-10 criterios, puntuación y fila); quality_inspections
        // es la tabla antigua (solo nota). Se leen las dos.
        const [qc, legacy] = await Promise.all([
            supabase.from('qc_inspections').select('grade, created_at, criteria, score, row_number')
                .eq('picker_id', pickerId).gte('created_at', sinceIso),
            supabase.from('quality_inspections').select('quality_grade, created_at')
                .eq('picker_id', pickerId).gte('created_at', sinceIso),
        ]);
        return [
            ...((qc.data || []) as Array<{ grade: string; created_at: string | null; criteria?: unknown; score?: number | null; row_number?: number | null }>)
                .map(i => ({
                    quality_grade: i.grade,
                    created_at: i.created_at,
                    criteria: i.criteria ?? null,
                    score: i.score ?? null,
                    row_number: i.row_number ?? null,
                })),
            ...((legacy.data || []) as Array<{ quality_grade: string | null; created_at: string | null }>),
        ];
    },

    /** Get day setups for an orchard since a given date */
    async getDaySetupsSince(orchardId: string, sinceDate: string) {
        const { data } = await supabase
            .from('day_setups')
            .select('date, variety, piece_rate, min_wage_rate')
            .eq('orchard_id', orchardId)
            .gte('date', sinceDate)
            .order('date', { ascending: false });
        return data || [];
    },
};
