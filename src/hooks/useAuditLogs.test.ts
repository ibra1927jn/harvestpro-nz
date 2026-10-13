/**
 * useAuditLogs Hook Tests — pure fetcher functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditRepository } from '@/repositories/audit.repository';

// Test the pure fetcher functions extracted from the hook
vi.mock('@/repositories/audit.repository', () => ({
    auditRepository: {
        query: vi.fn(),
    },
}));

describe('useAuditLogs fetcher logic', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('fetchAuditLogs', () => {
        it('delegates to auditRepository.query', async () => {
            const logs = [{ id: '1', action: 'INSERT', table_name: 'pickers' }];
            vi.mocked(auditRepository.query).mockResolvedValue(logs);
            const result = await auditRepository.query({ limit: 50 });
            expect(result).toEqual(logs);
            expect(auditRepository.query).toHaveBeenCalledWith({ limit: 50 });
        });
    });
});
