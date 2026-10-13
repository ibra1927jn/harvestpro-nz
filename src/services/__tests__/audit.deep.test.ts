/**
 * Deep tests for audit.service.ts — audit logging
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/nzst', () => ({
    nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

import { auditService } from '../audit.service';

describe('auditService', () => {
    it('exports all expected methods', () => {
        expect(typeof auditService.logAudit).toBe('function');
        expect(typeof auditService.logAuth).toBe('function');
        expect(typeof auditService.logPickerEvent).toBe('function');
        expect(typeof auditService.logQCEvent).toBe('function');
        expect(typeof auditService.logComplianceEvent).toBe('function');
        expect(typeof auditService.forceFlush).toBe('function');
    });

    it('logAuth does not throw', async () => {
        await expect(auditService.logAuth('login', 'u1', 'a@test.com')).resolves.not.toThrow();
    });

    it('logPickerEvent does not throw', async () => {
        await expect(auditService.logPickerEvent('created', 'p1', 'u1')).resolves.not.toThrow();
    });

    it('logQCEvent does not throw', async () => {
        await expect(auditService.logQCEvent('inspection_created', 'i1', 'p1', 'u1')).resolves.not.toThrow();
    });

    it('logComplianceEvent does not throw', async () => {
        await expect(auditService.logComplianceEvent('violation_detected', 'p1', { type: 'wage' })).resolves.not.toThrow();
    });

    it('forceFlush is a function', () => {
        expect(typeof auditService.forceFlush).toBe('function');
    });

    it('logAudit is a function', () => {
        expect(typeof auditService.logAudit).toBe('function');
    });
});


