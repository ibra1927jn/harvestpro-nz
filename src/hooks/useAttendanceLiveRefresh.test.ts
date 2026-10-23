import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createThrottle, useAttendanceLiveRefresh } from './useAttendanceLiveRefresh';
import { useHarvestStore } from '@/stores/useHarvestStore';

afterEach(() => vi.useRealTimers());

describe('createThrottle', () => {
    it('at most once per interval, with a trailing call', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const th = createThrottle(fn, 60_000);
        th.request();
        th.request();
        expect(fn).not.toHaveBeenCalled(); // la pantalla acaba de cargar
        vi.advanceTimersByTime(60_000);
        expect(fn).toHaveBeenCalledTimes(1);
        th.request();
        expect(fn).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60_000);
        expect(fn).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(120_000);
        th.request();
        expect(fn).toHaveBeenCalledTimes(3); // pasó el minuto: al momento
    });
});

describe('useAttendanceLiveRefresh', () => {
    it('refreshes after a live attendance change, throttled; not when disabled', () => {
        vi.useFakeTimers();
        const refresh = vi.fn();
        const { rerender } = renderHook(({ enabled }) => useAttendanceLiveRefresh(refresh, { enabled }), { initialProps: { enabled: true } });
        act(() => { useHarvestStore.setState({ attendanceChangedAt: Date.now() }); });
        act(() => { useHarvestStore.setState({ attendanceChangedAt: Date.now() + 1 }); });
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(refresh).toHaveBeenCalledTimes(1);
        rerender({ enabled: false });
        act(() => { useHarvestStore.setState({ attendanceChangedAt: Date.now() + 2 }); vi.advanceTimersByTime(120_000); });
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
