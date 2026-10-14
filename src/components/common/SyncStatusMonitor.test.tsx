/**
 * Tests for SyncStatusMonitor — Offline/sync status indicator
 * 
 * Shows different states: offline warning, syncing, success toast, idle
 * @module components/common/SyncStatusMonitor.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    buckets: [] as Array<{ synced: boolean; failed?: boolean }>,
    isOnline: true,
    wasOffline: false,
    clearWasOffline: vi.fn(),
    getPendingCount: vi.fn().mockResolvedValue(0),
    getMaxRetryCount: vi.fn().mockResolvedValue(0),
    getLastSyncTime: vi.fn().mockResolvedValue(null),
    processQueue: vi.fn(),
    getDeadLetters: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/services/config.service', () => ({
    getConfig: () => ({ SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'k' }),
}));
vi.mock('../../stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: any) => any) => selector({ buckets: mocks.buckets }),
}));
vi.mock('../../services/offline.service', () => ({
    offlineService: { getPendingCount: mocks.getPendingCount },
}));
vi.mock('../../services/sync.service', () => ({
    syncService: {
        processQueue: mocks.processQueue,
        getMaxRetryCount: mocks.getMaxRetryCount,
        getLastSyncTime: mocks.getLastSyncTime,
        getDeadLetters: mocks.getDeadLetters,
    },
}));
vi.mock('../../hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({
        isOnline: mocks.isOnline,
        wasOffline: mocks.wasOffline,
        clearWasOffline: mocks.clearWasOffline,
    }),
}));

import SyncStatusMonitor from './SyncStatusMonitor';
import { subscribeAnnouncer, resetAnnouncerForTests } from '../../services/announcer';

describe('SyncStatusMonitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isOnline = true;
        mocks.wasOffline = false;
        mocks.buckets = [];
        mocks.getPendingCount.mockResolvedValue(0);
        mocks.getDeadLetters.mockResolvedValue([]);
    });

    it('shows changes that could not be sent (dead letter queue) with type and reason', async () => {
        // Antes la cola de errores no se enseñaba en ninguna pantalla
        mocks.getDeadLetters.mockResolvedValue([
            { id: 'q1', type: 'UNLINK', failureReason: 'validation: max retries exceeded', movedAt: Date.parse('2026-10-13T01:00:00Z') },
            { id: 'q2', type: 'BREAK_LOG', failureReason: 'unknown_type: BREAK_LOG', movedAt: Date.parse('2026-10-13T00:00:00Z') },
        ]);
        render(<SyncStatusMonitor />);
        expect(await screen.findByText(/2 changes could not be sent — kept on this device/)).toBeInTheDocument();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.getByText(/Team unlink — validation: max retries exceeded/)).toBeInTheDocument();
        expect(screen.getByText(/BREAK_LOG — unknown_type: BREAK_LOG/)).toBeInTheDocument();
    });

    it('renders nothing when online and no pending items', () => {
        const { container } = render(<SyncStatusMonitor />);
        // Should return null when all synced and online
        expect(container.textContent).toBe('');
    });

    it('a scan rejected by the server is not shown as pending forever', async () => {
        mocks.buckets = [{ synced: true }, { synced: false, failed: true }];
        const { container } = render(<SyncStatusMonitor />);
        await act(async () => { await Promise.resolve(); });
        expect(container.textContent).not.toMatch(/pending|syncing|queued/i);
    });

    it('shows offline warning when not online', () => {
        mocks.isOnline = false;
        render(<SyncStatusMonitor />);
        expect(screen.getByText(/You are Offline/i)).toBeTruthy();
    });

    it('shows "queued" count when offline with pending items', () => {
        mocks.isOnline = false;
        mocks.buckets = [{ synced: false }, { synced: false }];
        render(<SyncStatusMonitor />);
        expect(screen.getByText(/2 queued/)).toBeTruthy();
    });

    it('shows offline warning with wifi_off icon', () => {
        mocks.isOnline = false;
        const { container } = render(<SyncStatusMonitor />);
        const icon = container.querySelector('.material-symbols-outlined');
        expect(icon?.textContent).toBe('wifi_off');
    });

    it('tells a screen reader user when the signal drops and comes back', () => {
        resetAnnouncerForTests();
        const heard: string[] = [];
        const off = subscribeAnnouncer(m => heard.push(m));
        const { rerender } = render(<SyncStatusMonitor />);
        expect(heard).toEqual([]);
        mocks.isOnline = false;
        rerender(<SyncStatusMonitor />);
        expect(heard[0]).toMatch(/^No signal\. Scans are saved on this phone/);
        mocks.isOnline = true;
        rerender(<SyncStatusMonitor />);
        off();
        expect(heard[1]).toMatch(/^Back online/);
    });

    it('speaks the connection change in the app language (Tongan user hears Tongan)', async () => {
        const { setCurrentLocale } = await import('@/i18n');
        const { translations } = await import('@/i18n/locales/all');
        resetAnnouncerForTests();
        setCurrentLocale('to');
        const heard: string[] = [];
        const off = subscribeAnnouncer(m => heard.push(m));
        try {
            const { rerender } = render(<SyncStatusMonitor />);
            mocks.isOnline = false;
            rerender(<SyncStatusMonitor />);
            expect(heard[0]).toBe(translations.to['sync.sr_offline']);
            expect(heard[0]).not.toMatch(/No signal/);
            expect(screen.getByText(translations.to['sync.offline'])).toBeTruthy();
        } finally {
            off();
            setCurrentLocale('en');
        }
    });
});
