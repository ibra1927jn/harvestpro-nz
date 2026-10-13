/**
 * storeSync — Deep functional tests
 * Targets: hydrateFromRecovery, hydrateFromDexie, fetchOrchardData, setupRealtimeSubscriptions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies ──────────────────────────
const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    mockLocalStorage[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
});

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn(),
    removeAllChannels: vi.fn(),
  },
}));

vi.mock('@/services/offline.service', () => ({
  offlineService: {
    getPendingBuckets: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
  todayNZST: () => '2026-03-09',
  toNZST: (d: Date) => d.toISOString(),
}));

vi.mock('@/repositories/store-sync.repository', () => ({
  storeSyncRepository: {
    getFirstOrchard: vi.fn().mockResolvedValue({ id: 'o1', name: 'Test Orchard' }),
    getSettings: vi.fn().mockResolvedValue({ piece_rate: 3.5, min_wage_rate: 23.5 }),
    getPickersQuery: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    getBucketRecordsQuery: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

import { hydrateFromRecovery, hydrateFromDexie, setupRealtimeSubscriptions } from './storeSync';

// ── Helpers ──────────────────────────────────
function makeSet() {
  const updates: any[] = [];
  const set = vi.fn((partial: any) => {
    if (typeof partial === 'function') {
      updates.push(
        partial({
          buckets: [],
          crew: [],
          bucketRecords: [],
          rowAssignments: [],
          lastSyncAt: null,
          recentQcInspections: [],
          recentTimesheetUpdates: [],
          orchard: null,
          settings: null,
        })
      );
    } else {
      updates.push(partial);
    }
  });
  return { set, updates };
}

function makeGet(overrides: Record<string, unknown> = {}) {
  return vi.fn(() => ({
    crew: [],
    buckets: [],
    bucketRecords: [],
    rows: [],
    orchardBlocks: [],
    orchardMapRows: [],
    orchard: null,
    settings: null,
    lastSyncAt: null,
    rowAssignments: [],
    fetchBlocks: vi.fn(),
    recalculateIntelligence: vi.fn(),
    recentQcInspections: [],
    recentTimesheetUpdates: [],
    ...overrides,
  }));
}

// ── hydrateFromRecovery ──────────────────────
describe('hydrateFromRecovery', () => {
  beforeEach(() => {
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
    vi.clearAllMocks();
  });

  it('recovers buckets from localStorage', () => {
    mockLocalStorage['harvest-pro-recovery'] = JSON.stringify({
      state: { buckets: [{ id: 'b1', type: 'BUCKET' }] },
    });
    const { set, updates } = makeSet();
    hydrateFromRecovery(set);
    expect(set).toHaveBeenCalled();
    const result = updates[0];
    expect(result.buckets).toBeDefined();
    expect(result.buckets.length).toBeGreaterThan(0);
  });

  it('clears recovery data after consuming', () => {
    mockLocalStorage['harvest-pro-recovery'] = JSON.stringify({
      state: { buckets: [{ id: 'b1' }] },
    });
    const { set } = makeSet();
    hydrateFromRecovery(set);
    expect(localStorage.removeItem).toHaveBeenCalledWith('harvest-pro-recovery');
  });

  it('skips if no recovery data', () => {
    const { set } = makeSet();
    hydrateFromRecovery(set);
    expect(set).not.toHaveBeenCalled();
  });

  it('handles malformed JSON gracefully', () => {
    mockLocalStorage['harvest-pro-recovery'] = 'not JSON {{{';
    const { set } = makeSet();
    expect(() => hydrateFromRecovery(set)).not.toThrow();
    // Should still clean up after error
    expect(localStorage.removeItem).toHaveBeenCalledWith('harvest-pro-recovery');
  });

  it('deduplicates against existing buckets', () => {
    mockLocalStorage['harvest-pro-recovery'] = JSON.stringify({
      state: { buckets: [{ id: 'existing1' }, { id: 'new1' }] },
    });
    const updates: any[] = [];
    const set = vi.fn((partial: any) => {
      if (typeof partial === 'function') {
        // Simulate state with bucket 'existing1' already present
        updates.push(
          partial({
            buckets: [{ id: 'existing1' }],
          })
        );
      }
    });
    hydrateFromRecovery(set);
    expect(updates[0].buckets.length).toBe(2); // 1 new + 1 existing
  });

  it('does not set state when no unique recovered buckets', () => {
    mockLocalStorage['harvest-pro-recovery'] = JSON.stringify({
      state: { buckets: [{ id: 'dup1' }] },
    });
    const updates: any[] = [];
    const set = vi.fn((partial: any) => {
      if (typeof partial === 'function') {
        const result = partial({ buckets: [{ id: 'dup1' }] });
        updates.push(result);
      }
    });
    hydrateFromRecovery(set);
    // When all are duplicates, returns state (unchanged)
    expect(updates.length).toBe(1);
  });

  it('handles empty buckets array', () => {
    mockLocalStorage['harvest-pro-recovery'] = JSON.stringify({ state: { buckets: [] } });
    const { set } = makeSet();
    hydrateFromRecovery(set);
    expect(set).not.toHaveBeenCalled();
  });
});

// ── hydrateFromDexie ─────────────────────────
describe('hydrateFromDexie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw on empty pending buckets', async () => {
    const { set } = makeSet();
    await expect(hydrateFromDexie(set)).resolves.toBeUndefined();
  });
});

// ── setupRealtimeSubscriptions ───────────────
describe('setupRealtimeSubscriptions', () => {
  it('is a function that accepts orchardId, getter, setter', () => {
    expect(typeof setupRealtimeSubscriptions).toBe('function');
    expect(setupRealtimeSubscriptions.length).toBe(3);
  });

  it('subscribes to the orchard channel without throwing', async () => {
    const { supabase } = await import('@/services/supabase');
    const get = makeGet();
    const { set } = makeSet();
    expect(() => setupRealtimeSubscriptions('o1', get, set)).not.toThrow();
    expect(supabase.channel).toHaveBeenCalledWith('harvest-live-o1');
  });
});

