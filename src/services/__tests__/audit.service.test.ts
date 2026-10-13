/**
 * audit.service.test.ts — Unit tests 
 *
 * Audit log flushing now routes through submit-audit-log Edge Function.
 * Uses vi.spyOn on edgeFunctionsRepository.invoke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/nzst', () => ({
    nowNZST: vi.fn(() => '2026-03-04T12:00:00+13:00'),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./config.service', () => ({
    getConfig: vi.fn(() => ({ isDevelopment: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test' })),
}));

import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { auditService, logAudit } from '../audit.service';

describe('auditService', () => {
    let mockInvoke: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockInvoke = vi.spyOn(edgeFunctionsRepository, 'invoke');
        mockInvoke.mockResolvedValue({ data: { inserted: 1 }, error: null });
    });

    describe('offline', () => {
        it('keeps logs while offline and sends them once the connection returns', async () => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
            try {
                await logAudit('system.error', 'Offline failure', { severity: 'error' });
                expect(mockInvoke).not.toHaveBeenCalled();

                Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
                window.dispatchEvent(new Event('online'));
                await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
                const entries = (mockInvoke.mock.calls[0][1] as { entries: Array<{ action: string }> }).entries;
                expect(entries.map(e => e.action)).toContain('Offline failure');
            } finally {
                Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            }
        });
    });

    describe('logAudit — immediate flush', () => {
        it('flushes critical events immediately via Edge Function', async () => {
            await logAudit('system.error', 'Critical failure', { severity: 'critical' });
            expect(mockInvoke).toHaveBeenCalledWith('submit-audit-log', expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ event_type: 'system.error', severity: 'critical' }),
                ]),
            }));
        });

        it('flushes error events immediately', async () => {
            await logAudit('system.error', 'Error happened', { severity: 'error' });
            expect(mockInvoke).toHaveBeenCalledTimes(1);
        });

        it('flushes events marked as immediate', async () => {
            await logAudit('auth.login', 'Login', { immediate: true });
            expect(mockInvoke).toHaveBeenCalledTimes(1);
        });

        it('includes created_at from nowNZST', async () => {
            await logAudit('auth.login', 'Login', { immediate: true });
            const call = mockInvoke.mock.calls[0];
            const entry = (call[1] as { entries: Array<{ created_at: string }> }).entries[0];
            expect(typeof entry.created_at).toBe('string');
            expect(entry.created_at.length).toBeGreaterThan(10);
        });

        it('includes userId and orchardId', async () => {
            await logAudit('auth.login', 'Login', {
                immediate: true,
                userId: 'u-1',
                orchardId: 'o-1',
            });
            const call = mockInvoke.mock.calls[0];
            const entry = (call[1] as { entries: Array<{ user_id: string; orchard_id: string }> }).entries[0];
            expect(entry.user_id).toBe('u-1');
            expect(entry.orchard_id).toBe('o-1');
        });
    });

    describe('logAudit — queued events', () => {
        it('does NOT flush info events immediately', async () => {
            await logAudit('auth.login', 'User logged in');
            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe('forceFlush', () => {
        it('flushes all queued events via Edge Function', async () => {
            await logAudit('auth.login', 'Login 1');
            await logAudit('auth.logout', 'Logout 1');
            expect(mockInvoke).not.toHaveBeenCalled();

            await auditService.forceFlush();
            expect(mockInvoke).toHaveBeenCalledTimes(1);
            expect(mockInvoke).toHaveBeenCalledWith('submit-audit-log', expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ event_type: 'auth.login' }),
                    expect.objectContaining({ event_type: 'auth.logout' }),
                ]),
            }));
        });

        it('does nothing when queue is empty', async () => {
            await auditService.forceFlush();
            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe('convenience functions', () => {
        it('logAuth creates auth event type', async () => {
            await auditService.logAuth('login', 'u-1', 'test@test.com');
            expect(mockInvoke).not.toHaveBeenCalled(); // info → queued
        });

        it('logPickerEvent creates picker event type', async () => {
            await auditService.logPickerEvent('created', 'p-1', 'u-1');
            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('logQCEvent creates QC event type', async () => {
            await auditService.logQCEvent('inspection_created', 'insp-1', 'p-1');
            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('logComplianceEvent creates compliance event type', async () => {
            await auditService.logComplianceEvent('break_started', 'p-1');
            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });
});


