/**
 * useAuditLogs Hook — React Query version
 * 
 * Fetches and manages audit logs with caching and deduplication.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryClient';
import { auditRepository } from '@/repositories/audit.repository';

// =============================================
// TYPES
// =============================================

export interface AuditLog {
    id: string;
    user_id: string | null;
    user_email: string | null;
    action: 'INSERT' | 'UPDATE' | 'DELETE' | 'CUSTOM';
    table_name: string;
    record_id: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
}

export interface AuditFilters {
    fromDate?: string;
    toDate?: string;
    userId?: string;
    tableName?: string;
    action?: 'INSERT' | 'UPDATE' | 'DELETE' | 'CUSTOM';
    limit?: number;
}

// =============================================
// FETCHER FUNCTIONS (pure, testable)
// =============================================

async function fetchAuditLogs(filters: AuditFilters): Promise<AuditLog[]> {
    return auditRepository.query(filters) as Promise<AuditLog[]>;
}

// =============================================
// HOOKS (React Query)
// =============================================

export function useAuditLogs(filters: AuditFilters = {}) {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: queryKeys.audit.logs(filters),
        queryFn: () => fetchAuditLogs(filters),
    });

    return {
        logs: data ?? [],
        isLoading,
        error: error as Error | null,
        refetch,
    };
}
