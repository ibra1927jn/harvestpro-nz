/**
 * useRunnerData Hook Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((selector?: (s: any) => unknown) => {
        const state = {
            fetchGlobalData: vi.fn(),
            orchard: { id: 'o1', name: 'Test Orchard', bucket_rate: 3.5 },
            crew: [
                { id: 'p1', name: 'Alice', picker_id: '101', total_buckets_today: 10 },
            ],
            todayBuckets: [],
            collections: [],
            inventory: [],
            fetchTodayBuckets: vi.fn(),
            fetchCollections: vi.fn(),
            addBucket: vi.fn(),
        };
        if (typeof selector === 'function') return selector(state);
        return state;
    }),
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: { id: 'u1', full_name: 'Test Runner', role: 'runner' },
    }),
}));

vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => ({ sendBroadcast: vi.fn() }),
}));

vi.mock('@/services/offline.service', () => ({
    offlineService: {
        getPendingCount: vi.fn().mockResolvedValue(0),
        getErrorItems: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/feedback.service', () => ({
    feedbackService: { vibrate: vi.fn(), triggerSuccess: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
    nowNZST: () => new Date('2026-03-07T10:00:00+13:00'),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useRunnerData } from './useRunnerData';
import { offlineService } from '@/services/offline.service';

describe('useRunnerData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists scans the server rejected (kept on the phone) with their reason', async () => {
        vi.mocked(offlineService.getErrorItems).mockResolvedValueOnce([
            { id: 's1', picker_id: 'LOC-018', orchard_id: 'o1', quality_grade: 'A', timestamp: '2026-10-12T10:01:00+13:00', synced: -1, scanned_by: 'r1', failure_reason: 'PAY_WEEK_CLOSED: closed' },
        ]);
        const { result } = renderHook(() => useRunnerData());
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.rejectedScans).toEqual([
            { id: 's1', picker_id: 'LOC-018', timestamp: '2026-10-12T10:01:00+13:00', reason: 'PAY_WEEK_CLOSED: closed' },
        ]);
    });

    it('provides orchard from store', () => {
        const { result } = renderHook(() => useRunnerData());
        expect(result.current.orchard).toEqual({ id: 'o1', name: 'Test Orchard', bucket_rate: 3.5 });
    });

    it('has initial state values', () => {
        const { result } = renderHook(() => useRunnerData());
        expect(result.current.showScanner).toBe(false);
        expect(result.current.qualityScan).toBeNull();
        expect(result.current.toast).toBeNull();
    });

    it('provides inventory with proper structure', () => {
        const { result } = renderHook(() => useRunnerData());
        expect(result.current.inventory).toBeDefined();
        expect(typeof result.current.inventory.full_bins).toBe('number');
        expect(typeof result.current.inventory.empty_bins).toBe('number');
        expect(typeof result.current.inventory.total).toBe('number');
    });

    it('handleScanClick opens scanner', () => {
        const { result } = renderHook(() => useRunnerData());
        act(() => {
            result.current.handleScanClick();
        });
        expect(result.current.showScanner).toBe(true);
    });

    it('setShowScanner toggles scanner', () => {
        const { result } = renderHook(() => useRunnerData());
        act(() => {
            result.current.setShowScanner(true);
        });
        expect(result.current.showScanner).toBe(true);
        act(() => {
            result.current.setShowScanner(false);
        });
        expect(result.current.showScanner).toBe(false);
    });

    it('setToast updates toast', () => {
        const { result } = renderHook(() => useRunnerData());
        act(() => {
            result.current.setToast({ message: 'Scan complete', type: 'success' });
        });
        expect(result.current.toast).toEqual({ message: 'Scan complete', type: 'success' });
    });

    it('provides handler functions', () => {
        const { result } = renderHook(() => useRunnerData());
        expect(typeof result.current.handleScanClick).toBe('function');
        expect(typeof result.current.handleScanComplete).toBe('function');
        expect(typeof result.current.submitQuality).toBe('function');
        expect(typeof result.current.handleBroadcast).toBe('function');
    });
});
