/**
 * Integration tests for remaining large view components
 * DashboardView (234L), DeadLetterQueueView (347L), HeatMapView (318L),
 * WageShieldPanel (241L), PayrollTabs (277L), AuditLogViewer (251L)
 */
import { describe, it, expect, vi } from 'vitest';

// Common mocks for all view components
vi.mock('@/stores/useHarvestStore', () => {
  const store = vi.fn(sel => {
    const state = {
      stats: { totalBuckets: 100, payEstimate: 2.5, tons: 3, velocity: 12, goalVelocity: 15 },
      crew: [],
      inventory: [],
      orchard: { id: 'o1', name: 'Test', total_rows: 20 },
      settings: { piece_rate: 6.5, target_tons: 10, min_wage_rate: 23.5, min_buckets_per_hour: 4 },
      bucketRecords: [],
      presentCount: 5,
      fetchGlobalData: vi.fn(),
      updateSettings: vi.fn(),
      addPicker: vi.fn(),
      removePicker: vi.fn(),
    };
    return sel ? sel(state) : state;
  });
  store.setState = vi.fn();
  store.getState = vi.fn();
  return { useHarvestStore: store };
});

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
  todayNZST: () => '2026-03-10',
  nowNZST: () => '2026-03-10T12:00:00+13:00',
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/context/MessagingContext', () => ({
  useMessaging: () => ({
    messages: [],
    broadcasts: [],
    chatGroups: [],
    unreadCount: 0,
    sendMessage: vi.fn(),
    sendBroadcast: vi.fn(),
    getOrCreateConversation: vi.fn(),
    setUserId: vi.fn(),
    setOrchardId: vi.fn(),
  }),
}));

vi.mock('@/services/db', () => ({
  db: {
    dead_letter_queue: {
      toArray: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn(),
    },
    sync_queue: { toArray: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  },
}));

describe('View Components Import Coverage', { timeout: 30000 }, () => {
  it('imports DashboardView', async () => {
    const mod = await import('@/components/views/manager/DashboardView');
    expect(mod.default).toBeDefined();
  });

  it('imports DeadLetterQueueView', async () => {
    const mod = await import('@/components/views/manager/DeadLetterQueueView');
    expect(mod.default).toBeDefined();
  });

  it('imports HeatMapView', async () => {
    const mod = await import('@/components/views/manager/HeatMapView');
    expect(mod.default).toBeDefined();
  });

  it('imports WageShieldPanel', async () => {
    const mod = await import('@/components/views/manager/WageShieldPanel');
    expect(mod.default).toBeDefined();
  });

  it('imports PayrollTabs', async () => {
    const mod = await import('@/components/views/payroll/PayrollTabs');
    expect(mod).toBeDefined();
  });

  it('imports AuditLogViewer', async () => {
    const mod = await import('@/components/AuditLogViewer');
    expect(mod).toBeDefined();
  });


  it('imports ChatWindow', async () => {
    const mod = await import('@/components/common/messaging/ChatWindow');
    expect(mod.default).toBeDefined();
  });

  it('imports InspectTab', async () => {
    const mod = await import('@/components/views/qc/InspectTab');
    expect(mod.default).toBeDefined();
  });

  it('imports TimesheetEditor', async () => {
    const mod = await import('@/components/views/manager/TimesheetEditor');
    expect(mod.default).toBeDefined();
  });

  it('imports LogisticsView', async () => {
    const mod = await import('@/components/views/manager/LogisticsView');
    expect(mod.default).toBeDefined();
  });

  it('imports DesktopLayout', async () => {
    const mod = await import('@/components/common/DesktopLayout');
    expect(mod.default).toBeDefined();
  });
});
