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
});
