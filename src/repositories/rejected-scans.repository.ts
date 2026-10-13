/**
 * Escaneos que record-bucket rechazó o guardó con la hora dudosa
 * (tabla rejected_scans). RLS: manager de su huerto y admin.
 */
import { supabase } from '@/services/supabase';

export interface RejectedScanRow {
    id: string;
    kind: 'rejected' | 'flagged';
    reason: string;
    pickerCode: string;
    pickerName: string | null;
    reportedBy: string | null;
    scannedAt: string | null;
    createdAt: string;
}

export const rejectedScansRepository = {
    /** Los de los últimos `days` días (por fecha de reporte), más recientes primero */
    async listRecent(orchardId: string, days = 7): Promise<RejectedScanRow[]> {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        const { data, error } = await supabase
            .from('rejected_scans')
            .select('id, kind, reason, picker_code, scanned_at, created_at, pickers(name), users(full_name)')
            .eq('orchard_id', orchardId)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) throw error;
        return ((data ?? []) as unknown as {
            id: string; kind: 'rejected' | 'flagged'; reason: string; picker_code: string;
            scanned_at: string | null; created_at: string;
            pickers: { name: string | null } | null; users: { full_name: string | null } | null;
        }[]).map(r => ({
            id: r.id,
            kind: r.kind,
            reason: r.reason,
            pickerCode: r.picker_code,
            pickerName: r.pickers?.name ?? null,
            reportedBy: r.users?.full_name ?? null,
            scannedAt: r.scanned_at,
            createdAt: r.created_at,
        }));
    },
};
