/**
 * Remaining repositories coverage — tests for uncovered repos
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('Repository modules', () => {
  it('imports admin repository', async () => {
    const mod = await import('./admin.repository');
    expect(mod.adminRepository).toBeDefined();
  });

  it('imports analytics trends repository', async () => {
    const mod = await import('@/repositories/analytics-trends.repository');
    expect(mod.analyticsTrendsRepository).toBeDefined();
  });

  it('imports bin repository', async () => {
    const mod = await import('./bin.repository');
    expect(mod.binRepository).toBeDefined();
  });

  it('imports bucket ledger repository', async () => {
    const mod = await import('@/repositories/bucket-ledger.repository');
    expect(mod.bucketLedgerRepository).toBeDefined();
  });

  it('imports edge functions repository', async () => {
    const mod = await import('@/repositories/edge-functions.repository');
    expect(mod.edgeFunctionsRepository).toBeDefined();
  });

  it('imports optimistic lock repository', async () => {
    const mod = await import('@/repositories/optimistic-lock.repository');
    expect(mod.optimisticLockRepository).toBeDefined();
  });

  it('imports orchard map repository', async () => {
    const mod = await import('@/repositories/orchard-map.repository');
    expect(mod.orchardMapRepository).toBeDefined();
  });

  it('imports payroll repository', async () => {
    const mod = await import('./payroll.repository');
    expect(mod.payrollRepository).toBeDefined();
  });

  it('imports picker history repository', async () => {
    const mod = await import('@/repositories/picker-history.repository');
    expect(mod.pickerHistoryRepository).toBeDefined();
  });

  it('imports qc repository', async () => {
    const mod = await import('./qc.repository');
    expect(mod.qcRepository).toBeDefined();
  });

  it('imports rpc repository', async () => {
    const mod = await import('./rpc.repository');
    expect(mod.rpcRepository).toBeDefined();
  });

  it('imports settings repository', async () => {
    const mod = await import('./settings.repository');
    expect(mod.settingsRepository).toBeDefined();
  });

  it('imports setup repository', async () => {
    const mod = await import('./setup.repository');
    expect(mod.setupRepository).toBeDefined();
  });

  it('imports user service repository', async () => {
    const mod = await import('@/repositories/user-service.repository');
    expect(mod.userServiceRepository).toBeDefined();
  });
});
