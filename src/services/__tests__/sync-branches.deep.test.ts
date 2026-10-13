/**
 * Deep branch tests for sync.service.ts categorizeError
 * Exercises all error classification branches
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/utils/nzst', () => ({
    toNZST: (d: Date) => d.toISOString(),
    nowNZST: () => '2026-03-10T12:00:00+13:00',
}));
vi.mock('@/utils/uuid', () => ({
    safeUUID: () => 'test-uuid',
}));

import { syncService } from '../sync.service';

describe('syncService.categorizeError — all branches', () => {
    // Network errors
    it('classifies "Failed to fetch" as network', () => {
        expect(syncService.categorizeError(new TypeError('Failed to fetch'))).toBe('network');
    });

    it('classifies "NetworkError" as network', () => {
        expect(syncService.categorizeError(new Error('NetworkError when...'))).toBe('network');
    });

    it('classifies "timeout" error as network', () => {
        expect(syncService.categorizeError(new Error('Request timeout'))).toBe('network');
    });

    it('classifies "aborted" error as network', () => {
        expect(syncService.categorizeError(new Error('The operation was aborted'))).toBe('network');
    });

    // Server errors
    it('classifies "500" as server', () => {
        expect(syncService.categorizeError(new Error('500 Internal Server Error'))).toBe('server');
    });

    it('classifies "502" as server', () => {
        expect(syncService.categorizeError(new Error('502 Bad Gateway'))).toBe('server');
    });

    it('classifies "503" as server', () => {
        expect(syncService.categorizeError(new Error('503 Service Unavailable'))).toBe('server');
    });

    it('classifies "429" as server', () => {
        expect(syncService.categorizeError(new Error('429 Too Many Requests'))).toBe('server');
    });

    // Validation errors
    it('classifies "23505" constraint as validation', () => {
        expect(syncService.categorizeError(new Error('23505 unique constraint violation'))).toBe('validation');
    });

    it('classifies "constraint" error as validation', () => {
        expect(syncService.categorizeError(new Error('constraint violation'))).toBe('validation');
    });

    it('classifies "unique" error as validation', () => {
        expect(syncService.categorizeError(new Error('unique key conflict'))).toBe('validation');
    });

    it('classifies "foreign key" error as validation', () => {
        expect(syncService.categorizeError(new Error('foreign key violation'))).toBe('validation');
    });

    it('classifies "conflict" error as validation', () => {
        expect(syncService.categorizeError(new Error('conflict detected'))).toBe('validation');
    });

    it('classifies "optimistic lock" error as validation', () => {
        expect(syncService.categorizeError(new Error('optimistic lock failed'))).toBe('validation');
    });

    // Supabase error objects
    it('classifies Supabase code "23505" as validation', () => {
        expect(syncService.categorizeError({ code: '23505', message: 'unique key' })).toBe('validation');
    });

    it('classifies Supabase code "PGRST" as server', () => {
        expect(syncService.categorizeError({ code: 'PGRST', message: 'PostgREST error' })).toBe('server');
    });

    // Unknown
    it('classifies string error as unknown', () => {
        expect(syncService.categorizeError('something random')).toBe('unknown');
    });

    it('classifies null error as unknown', () => {
        expect(syncService.categorizeError(null)).toBe('unknown');
    });

    it('classifies generic Error as unknown', () => {
        expect(syncService.categorizeError(new Error('something unusual'))).toBe('unknown');
    });
});

