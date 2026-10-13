/**
 * Audit Repository — Domain queries for audit_logs table
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';

export const auditRepository = {
    /** Insert a single audit log entry (best-effort) */
    async insertSafe(entry: Record<string, unknown>) {
        const { error } = await supabase.from('audit_logs').insert([entry]);
        if (error) logger.error('[AuditRepo] Audit log insert failed — compliance gap:', error);
    },

    /** Batch-insert audit logs */
    async insertBatch(logs: Record<string, unknown>[]) {
        const { error } = await supabase.from('audit_logs').insert(logs);
        if (error) throw error;
    },

    /** Query audit logs with filters */
    async query(filters: {
        fromDate?: string; toDate?: string; userId?: string;
        tableName?: string; action?: string; limit?: number;
    }) {
        let query = supabase.from('audit_logs').select('*')
            .order('created_at', { ascending: false })
            .limit(filters.limit || 100);
        if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
        if (filters.toDate) query = query.lte('created_at', filters.toDate);
        if (filters.userId) query = query.eq('user_id', filters.userId);
        if (filters.tableName) query = query.eq('table_name', filters.tableName);
        if (filters.action) query = query.eq('action', filters.action);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },
};
