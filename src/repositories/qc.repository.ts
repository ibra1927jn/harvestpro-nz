/**
 * QC Repository — Domain queries for qc_inspections table
 */
import { supabase } from '@/services/supabase';

export const QC_PHOTOS_BUCKET = 'qc-photos';

export const qcRepository = {
    /**
     * Sube la foto de una inspección (bucket privado; se guarda la ruta y se
     * enseña con enlace firmado). Repetir la misma ruta no es un error: un
     * intento anterior de la cola ya la subió.
     */
    async uploadPhoto(path: string, blob: Blob): Promise<string> {
        const { data, error } = await supabase.storage
            .from(QC_PHOTOS_BUCKET)
            .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
        if (error) {
            const e = error as { message?: string; statusCode?: string | number };
            if (String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '')) return path;
            throw error;
        }
        return data?.path ?? path;
    },

    /** Insert a new inspection */
    async insert(payload: Record<string, unknown>) {
        const { data, error } = await supabase
            .from('qc_inspections')
            .insert(payload)
            .select()
            .single();
        return { data, error };
    },

    /** Get inspections for an orchard within a date range */
    async getByOrchardAndDateRange(orchardId: string, startISO: string, endISO: string) {
        const { data, error } = await supabase
            .from('qc_inspections')
            .select('*')
            .eq('orchard_id', orchardId)
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    /** Get inspections for a specific picker */
    async getByPicker(pickerId: string, limit = 20) {
        const { data, error } = await supabase
            .from('qc_inspections')
            .select('*')
            .eq('picker_id', pickerId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },
};
