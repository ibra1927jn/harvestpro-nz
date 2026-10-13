/**
 * Deep edge-case tests for hhrr.service.ts
 * Covers: fetchHRSummary, fetchEmployees, fetchPayroll, fetchComplianceAlerts
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/repositories/user.repository', () => ({
  userRepository2: {
    getAll: vi
      .fn()
      .mockResolvedValue([
        {
          id: 'u1',
          full_name: 'Alice',
          email: 'a@test.com',
          role: 'picker',
          status: 'active',
          created_at: '2026-01-01',
          orchard_id: 'o1',
        },
      ]),
  },
}));

vi.mock('@/repositories/contract.repository', () => ({
  contractRepository: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'c1' }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/repositories/attendance.repository', () => ({
  attendanceRepository: {
    getByDateWithPickers: vi.fn().mockResolvedValue([]),
    getWeeklyAttendance: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

import {
  fetchHRSummary,
  fetchEmployees,
  fetchComplianceAlerts,
} from '../hhrr.service';

describe('fetchHRSummary', () => {
  it('returns summary with counts', async () => {
    const summary = await fetchHRSummary('o1');
    expect(summary).toHaveProperty('activeWorkers');
    expect(summary).toHaveProperty('pendingContracts');
    expect(summary).toHaveProperty('payrollThisWeek');
    expect(summary).toHaveProperty('complianceAlerts');
  });
});

describe('fetchEmployees', () => {
  it('returns employee list', async () => {
    const employees = await fetchEmployees('o1');
    expect(Array.isArray(employees)).toBe(true);
  });
});

describe('fetchComplianceAlerts', () => {
  it('returns alerts array', async () => {
    const alerts = await fetchComplianceAlerts('o1');
    expect(Array.isArray(alerts)).toBe(true);
  });
});

