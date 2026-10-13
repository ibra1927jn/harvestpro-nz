// =============================================
// HHRR SERVICE TESTS
// =============================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  fetchHRSummary,
  fetchEmployees,
  fetchPayroll,
  fetchComplianceAlerts,
} from '../hhrr.service';
import { supabase } from '../supabase';

// =============================================
// MOCK DATA
// =============================================

const MOCK_USERS = [
  {
    id: 'u-001',
    full_name: 'James Wilson',
    email: 'james@test.nz',
    role: 'picker',
    is_active: true,
    orchard_id: 'o-001',
  },
  {
    id: 'u-002',
    full_name: 'Sarah Chen',
    email: 'sarah@test.nz',
    role: 'picker',
    is_active: true,
    orchard_id: 'o-001',
  },
  {
    id: 'u-003',
    full_name: 'Mike Brown',
    email: 'mike@test.nz',
    role: 'team_leader',
    is_active: false,
    orchard_id: 'o-001',
  },
];

const MOCK_CONTRACTS = [
  {
    id: 'c-001',
    employee_id: 'u-001',
    type: 'seasonal',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01',
    hourly_rate: 23.5,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    users: { full_name: 'James Wilson' },
  },
  {
    id: 'c-002',
    employee_id: 'u-002',
    type: 'casual',
    status: 'expiring',
    start_date: '2026-01-15',
    end_date: '2026-02-20',
    hourly_rate: 23.5,
    notes: 'Short-term',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    users: { full_name: 'Sarah Chen' },
  },
];

const MOCK_ATTENDANCE = [
  {
    picker_id: 'u-001',
    check_in: '2026-02-13T07:00:00Z',
    check_out: '2026-02-13T15:00:00Z',
  },
  {
    picker_id: 'u-002',
    check_in: '2026-02-13T08:00:00Z',
    check_out: '2026-02-13T14:00:00Z',
  },
];

const MOCK_BUCKET_RECORDS = [
  { picker_id: 'u-001', scanned_at: '2026-02-13T10:00:00Z' },
  { picker_id: 'u-001', scanned_at: '2026-02-13T11:00:00Z' },
  { picker_id: 'u-002', scanned_at: '2026-02-13T12:00:00Z' },
];

// =============================================
// TESTS
// =============================================

describe('HHRR Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabase, 'from');
  });

  // =============================================
  // fetchHRSummary
  // =============================================
  describe('fetchHRSummary', () => {
    it('should return summary with active worker counts', async () => {
      let callCount = 0;
      (supabase.from as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: MOCK_USERS.filter(u => u.is_active),
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: MOCK_CONTRACTS.filter(c => c.status === 'expiring'),
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: MOCK_ATTENDANCE,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      const summary = await fetchHRSummary('o-001');

      expect(summary).toBeDefined();
      expect(typeof summary.activeWorkers).toBe('number');
      expect(typeof summary.pendingContracts).toBe('number');
      expect(typeof summary.payrollThisWeek).toBe('number');
    });

    it('should return zero values on error', async () => {
      (supabase.from as Mock).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
            in: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
            }),
          }),
        }),
      }));

      const summary = await fetchHRSummary('o-001');
      expect(summary.activeWorkers).toBe(0);
    });
  });

  // =============================================
  // fetchEmployees
  // =============================================
  describe('fetchEmployees', () => {
    it('should return enriched employee list', async () => {
      let callCount = 0;
      (supabase.from as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: MOCK_USERS,
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: MOCK_CONTRACTS,
                error: null,
              }),
            }),
          };
        }
      });

      const employees = await fetchEmployees('o-001');
      expect(employees).toBeDefined();
      expect(Array.isArray(employees)).toBe(true);
    });

    it('should return empty array on error', async () => {
      (supabase.from as Mock).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
          }),
        }),
      }));

      const employees = await fetchEmployees('o-001');
      expect(employees).toEqual([]);
    });
  });

  // =============================================
  // fetchPayroll
  // =============================================
  describe('fetchPayroll', () => {
    it('should join attendance + bucket_records for payroll', async () => {
      let callCount = 0;
      (supabase.from as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: MOCK_USERS.filter(u => u.is_active),
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: MOCK_ATTENDANCE,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        } else if (callCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: MOCK_BUCKET_RECORDS,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        } else {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: MOCK_CONTRACTS,
                  error: null,
                }),
              }),
            }),
          };
        }
      });

      const payroll = await fetchPayroll('o-001');
      expect(payroll).toBeDefined();
      expect(Array.isArray(payroll)).toBe(true);
    });
  });

  // =============================================
  // fetchComplianceAlerts
  // =============================================
  describe('fetchComplianceAlerts', () => {
    it('should detect expiring contracts', async () => {
      let callCount = 0;
      (supabase.from as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [
                      {
                        ...MOCK_CONTRACTS[1],
                        end_date: '2026-02-20',
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: MOCK_USERS,
                  error: null,
                }),
              }),
            }),
          };
        }
      });

      const alerts = await fetchComplianceAlerts('o-001');
      expect(alerts).toBeDefined();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should return empty array on error', async () => {
      (supabase.from as Mock).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
            }),
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
          }),
        }),
      }));

      const alerts = await fetchComplianceAlerts('o-001');
      expect(alerts).toEqual([]);
    });
  });

  // =============================================
  // R9 REGRESSION TESTS
  // =============================================
});
