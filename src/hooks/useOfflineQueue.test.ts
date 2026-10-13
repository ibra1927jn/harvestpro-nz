/**
 * useOfflineQueue — Tests for offline queue processing hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOfflineQueue } from './useOfflineQueue';

// Mock dependencies
vi.mock('@/services/db', () => ({
  db: {
    sync_queue: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('@/services/user.service', () => ({
  userService: {
    unassignUserFromOrchard: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useOfflineQueue', () => {
  const mockFetchGlobalData = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { result } = renderHook(() => useOfflineQueue(mockFetchGlobalData));
    expect(result).toBeDefined();
  });

  it('registers online event listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useOfflineQueue(mockFetchGlobalData));
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    addSpy.mockRestore();
  });

  it('removes online event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOfflineQueue(mockFetchGlobalData));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('processes queue when online on mount', async () => {
    // navigator.onLine is true in test env by default
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { db } = await import('@/services/db');
    renderHook(() => useOfflineQueue(mockFetchGlobalData));
    // The effect runs, calling db.sync_queue.where
    await vi.waitFor(() => {
      expect(db.sync_queue.where).toHaveBeenCalledWith('type');
    });
  });

  it('does nothing when offline on mount', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { db: _db } = await import('@/services/db');
    vi.clearAllMocks();
    renderHook(() => useOfflineQueue(mockFetchGlobalData));
    // Give it a tick
    await new Promise(r => setTimeout(r, 0));
    // When offline, queue processing should NOT start
    // (the where call happens only from processQueue)
    expect(_db.sync_queue.where).not.toHaveBeenCalled();
  });

  it('processes pending unlink items', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    const { db } = await import('@/services/db');
    const { userService } = await import('@/services/user.service');

    const mockItems = [{ id: 1, type: 'UNLINK', payload: { userId: 'user-1' }, retryCount: 0 }];

    vi.mocked(db.sync_queue.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockItems),
      }),
    } as never);

    renderHook(() => useOfflineQueue(mockFetchGlobalData));

    await vi.waitFor(() => {
      expect(userService.unassignUserFromOrchard).toHaveBeenCalledWith('user-1');
    });
  });
});
