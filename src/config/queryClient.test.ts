/**
 * Tests for queryClient.ts — React Query defaults + key factory.
 */
import { describe, it, expect } from 'vitest';
import { queryClient, queryKeys } from '@/config/queryClient';

describe('queryClient — defaults', () => {
  it('exposes a configured QueryClient', () => {
    expect(queryClient).toBeDefined();
    expect(queryClient.getDefaultOptions).toBeDefined();
  });

  it('uses 5-min staleTime tuned for field workers', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(5 * 60 * 1000);
  });

  it('uses 30-min gcTime to keep cache warm offline', () => {
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(30 * 60 * 1000);
  });

  it('does not refetch on window focus (apps switch frequently)', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it('always refetches on reconnect (offline-first recovery)', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnReconnect).toBe('always');
  });

  it('retries queries twice and mutations once', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(2);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(1);
  });
});

describe('queryKeys — factory shape', () => {
  it('attendance.all is a stable readonly tuple', () => {
    expect(queryKeys.attendance.all).toEqual(['attendance']);
  });

  it('attendance.daily includes orchard id as third segment', () => {
    expect(queryKeys.attendance.daily('orch-1')).toEqual(['attendance', 'daily', 'orch-1']);
  });

  it('attendance.picker includes picker id', () => {
    expect(queryKeys.attendance.picker('p-42')).toEqual(['attendance', 'picker', 'p-42']);
  });

  it('audit.logs accepts arbitrary filter object', () => {
    const filters = { from: '2026-01-01', user: 'u1' };
    expect(queryKeys.audit.logs(filters)).toEqual(['audit', 'logs', filters]);
  });

  it('audit.logs accepts undefined filters', () => {
    expect(queryKeys.audit.logs()).toEqual(['audit', 'logs', undefined]);
  });

  it('compliance.alerts namespaces by orchard', () => {
    expect(queryKeys.compliance.alerts('o-1')).toEqual(['compliance', 'alerts', 'o-1']);
  });

  it('security.failedAttempts includes limit', () => {
    expect(queryKeys.security.failedAttempts(50)).toEqual(['security', 'failed', 50]);
  });

  it('security.locks is a stable tuple', () => {
    expect(queryKeys.security.locks).toEqual(['security', 'locks']);
  });

  it('pickers.byTeam handles both ids defined', () => {
    expect(queryKeys.pickers.byTeam('tl-1', 'o-1')).toEqual(['pickers', 'team', 'tl-1', 'o-1']);
  });

  it('pickers.byTeam handles missing ids', () => {
    expect(queryKeys.pickers.byTeam()).toEqual(['pickers', 'team', undefined, undefined]);
  });

  it('timesheets.byOrchard supports optional date range', () => {
    expect(queryKeys.timesheets.byOrchard('o-1', '2026-04-01..2026-04-07')).toEqual([
      'timesheets',
      'o-1',
      '2026-04-01..2026-04-07',
    ]);
    expect(queryKeys.timesheets.byOrchard('o-1')).toEqual(['timesheets', 'o-1', undefined]);
  });

  it('all-namespaces are stable across calls (referential equality)', () => {
    expect(queryKeys.attendance.all).toBe(queryKeys.attendance.all);
    expect(queryKeys.audit.all).toBe(queryKeys.audit.all);
    expect(queryKeys.compliance.all).toBe(queryKeys.compliance.all);
  });
});
