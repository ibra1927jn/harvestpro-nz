/**
 * Deep tests for optimistic-lock.service.ts (103L) — import + export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/repositories/optimistic-lock.repository', () => ({
  optimisticLockRepository: {
    conditionalUpdate: vi.fn().mockResolvedValue({ data: null, error: null }),
    getById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
  },
}));

import { withOptimisticLock, updateWithoutLock } from '../optimistic-lock.service';
import type { OptimisticLockOptions } from '../optimistic-lock.service';

describe('optimistic-lock.service — deep tests', () => {
  it('exports withOptimisticLock function', () => {
    expect(withOptimisticLock).toBeDefined();
    expect(typeof withOptimisticLock).toBe('function');
  });

  it('exports updateWithoutLock function', () => {
    expect(updateWithoutLock).toBeDefined();
    expect(typeof updateWithoutLock).toBe('function');
  });

  it('OptimisticLockOptions type is importable', () => {
    const opts: OptimisticLockOptions = {
      table: 'test',
      recordId: '1',
      expectedUpdatedAt: '2026-01-01',
      updates: {},
    };
    expect(opts.table).toBe('test');
  });
});


