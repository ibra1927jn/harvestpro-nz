/**
 * E2E tests for hhrr.service.ts
 * fetchHRSummary, fetchEmployees,
 * fetchPayroll, fetchComplianceAlerts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/nzst', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/nzst')>()),
  todayNZST: () => '2026-03-10',
  nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

const mockGetActiveCount = vi.fn().mockResolvedValue(15);
const mockGetAll = vi.fn().mockResolvedValue([
  {
    id: 'u1',
    full_name: 'Alice',
    email: 'a@test.com',
    role: 'picker',
    is_active: true,
    created_at: '2025-01-01',
    orchard_id: 'o1',
  },
  {
    id: 'u2',
    full_name: 'Bob',
    email: 'b@test.com',
    role: 'team_leader',
    is_active: false,
    created_at: '2025-06-01',
    orchard_id: 'o1',
  },
]);
const mockGetNamesByIds = vi.fn().mockResolvedValue({ u1: 'Alice', u2: 'Bob' });

vi.mock('@/repositories/user.repository', () => ({
  userRepository2: {
    getActiveCount: (...a: unknown[]) => mockGetActiveCount(...a),
    getAll: (...a: unknown[]) => mockGetAll(...a),
    // Plantilla para RRHH: misma forma que getStaff (aquí desde las filas de prueba)
    getStaff: async (...a: unknown[]) =>
      ((await mockGetAll(...a)) as Array<Record<string, unknown>>).map(u => ({
        id: u.id,
        full_name: (u.full_name as string) || 'Unknown',
        email: (u.email as string) || '',
        role: (u.role as string) || 'picker',
        active: !!u.is_active,
        created_at: u.created_at,
        orchard_id: u.orchard_id,
        source: 'staff',
      })),
    getNamesByIds: (...a: unknown[]) => mockGetNamesByIds(...a),
  },
}));

// Contratos abiertos de la empresa: c1 activo sin copia firmada → 1 pendiente
const mockListOpen = vi.fn().mockResolvedValue([{ id: 'c1', employee_id: 'u1', status: 'active', end_date: '2026-12-31' }]);
const mockListPersonDocuments = vi.fn().mockResolvedValue([]);

vi.mock('@/repositories/hr-documents.repository', () => ({
  hrDocumentsRepository: {
    listPersonDocuments: (...a: unknown[]) => mockListPersonDocuments(...a),
    listExpiringCompany: vi.fn().mockResolvedValue([]),
  },
  HR_DOCUMENT_TYPE_LABELS: {},
}));
const mockGetAllContracts = vi
  .fn()
  .mockResolvedValue([
    {
      id: 'c1',
      employee_id: 'u1',
      type: 'seasonal',
      status: 'active',
      start_date: '2025-01-01',
      end_date: '2026-12-31',
      hourly_rate: 25,
      notes: '',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    },
  ]);
const mockGetByEmployeeIds = vi
  .fn()
  .mockResolvedValue([
    {
      id: 'c1',
      employee_id: 'u1',
      type: 'seasonal',
      start_date: '2025-01-01',
      end_date: '2026-12-31',
      hourly_rate: 25,
    },
  ]);
const mockGetExpiringSoon = vi
  .fn()
  .mockResolvedValue([
    {
      id: 'c2',
      employee_id: 'u1',
      type: 'seasonal',
      end_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    },
  ]);
const mockGetExpiredButActive = vi
  .fn()
  .mockResolvedValue([{ id: 'c3', employee_id: 'u2', type: 'permanent', end_date: '2025-01-01' }]);

vi.mock('@/repositories/contract.repository', () => ({
  contractRepository2: {
    listOpen: (...a: unknown[]) => mockListOpen(...a),
    getAll: (...a: unknown[]) => mockGetAllContracts(...a),
    getByEmployeeIds: (...a: unknown[]) => mockGetByEmployeeIds(...a),
    getExpiringSoon: (...a: unknown[]) => mockGetExpiringSoon(...a),
    getExpiredButActive: (...a: unknown[]) => mockGetExpiredButActive(...a),
  },
}));

const mockGetHoursSummary = vi.fn().mockResolvedValue([
  {
    picker_id: 'u1',
    check_in: '2026-03-10T06:00:00Z',
    check_out: '2026-03-10T14:00:00Z',
    break_start: '2026-03-10T10:00:00Z', // descanso anotado por el team leader
  },
  {
    picker_id: 'u2',
    check_in: '2026-03-10T07:00:00Z',
    check_out: '2026-03-10T13:00:00Z',
    break_start: '2026-03-10T10:00:00Z',
  },
]);

vi.mock('@/repositories/attendance.repository', () => ({
  attendanceRepository: {
    getHoursSummary: (...a: unknown[]) => mockGetHoursSummary(...a),
  },
}));

vi.mock('@/repositories/settings.repository', () => ({
  settingsRepository: {
    getByOrchardId: vi.fn().mockResolvedValue({ piece_rate: 7.0 }),
  },
}));

const mockGetBucketCounts = vi
  .fn()
  .mockResolvedValue([
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
    { picker_id: 'u1', scanned_at: '2026-03-10T08:00:00Z' },
  ]);

vi.mock('@/repositories/store-sync.repository', () => ({
  storeSyncRepository: {
    getBucketCounts: (...a: unknown[]) => mockGetBucketCounts(...a),
  },
}));

import {
  fetchHRSummary,
  fetchEmployees,
  fetchPayroll,
  fetchComplianceAlerts,
} from '../hhrr.service';

describe('hhrr.service — E2E deep tests', () => {
  beforeEach(() => vi.clearAllMocks());

  // ========== fetchHRSummary ==========
  describe('fetchHRSummary', () => {
    it('aggregates all HR metrics', async () => {
      const summary = await fetchHRSummary('o1');
      expect(summary.activeWorkers).toBe(15);
      expect(summary.pendingContracts).toBe(1);
      expect(summary.payrollThisWeek).toBeGreaterThan(0);
      expect(summary.complianceAlerts).toBeGreaterThan(0);
    });

    it('an active contract with its signed copy on file is not pending', async () => {
      mockListPersonDocuments.mockResolvedValueOnce([
        { id: 'd1', picker_id: 'u1', user_id: null, document_type: 'employment_agreement', expires_at: '2026-12-31', contract_id: 'c1', storage_path: 'o1/x.pdf' },
      ]);
      const summary = await fetchHRSummary('o1');
      expect(summary.pendingContracts).toBe(0);
    });

    it('calculates payroll with the unified rules (unpaid break, daily top-up)', async () => {
      const summary = await fetchHRSummary('o1');
      // u1: 8 h − 0.5 descanso = 7.5 h → 179.63 (10 cubetas × 7 = 70 + complemento)
      // u2: 6 h − 0.5 = 5.5 h → 131.73 (sin cubetas)
      expect(summary.payrollThisWeek).toBe(311.36);
    });

    it('reads the week from Monday 00:00 NZ time, not 00:00 UTC', async () => {
      await fetchHRSummary('o1');
      // 2026-03-10 es martes → semana desde el lunes 2026-03-09 (NZDT, +13:00)
      expect(mockGetBucketCounts).toHaveBeenCalledWith('o1', '2026-03-09T00:00:00+13:00');
      expect(mockGetHoursSummary).toHaveBeenCalledWith('o1', '2026-03-09');
    });

    it('open shift on a past day is estimated from scans, not counted until now', async () => {
      mockGetHoursSummary.mockResolvedValueOnce([
        { picker_id: 'u1', check_in: '2026-03-10T06:00:00Z', check_out: null },
      ]);
      const summary = await fetchHRSummary('o1');
      // Todas las cubetas tienen la misma hora: 0 h estimadas → solo pago por cubeta
      expect(summary.payrollThisWeek).toBe(70);
    });

    it('returns zeros on error', async () => {
      mockGetActiveCount.mockRejectedValueOnce(new Error('DB error'));
      const summary = await fetchHRSummary('o1');
      expect(summary).toEqual({
        activeWorkers: 0,
        pendingContracts: 0,
        payrollThisWeek: 0,
        complianceAlerts: 0,
      });
    });
  });

  // ========== fetchEmployees ==========
  describe('fetchEmployees', () => {
    it('maps users with contract data', async () => {
      const employees = await fetchEmployees('o1');
      expect(employees.length).toBe(2);
      expect(employees[0].full_name).toBe('Alice');
      // Contrato activo pero sin copia firmada → alta pendiente
      expect(employees[0].status).toBe('pending');
      expect(employees[0].missing_items).toContain('signed_copy');
      expect(employees[0].contract_type).toBe('seasonal');
      expect(employees[0].hourly_rate).toBe(25);
    });

    it('is active once the signed agreement is on file', async () => {
      mockListPersonDocuments.mockResolvedValueOnce([
        { id: 'd1', picker_id: 'u1', user_id: null, document_type: 'employment_agreement', expires_at: '2026-12-31', contract_id: 'c1', storage_path: 'o1/x.pdf' },
      ]);
      const employees = await fetchEmployees('o1');
      expect(employees[0].status).toBe('active');
      expect(employees[0].contract_document?.id).toBe('d1');
    });

    it('maps terminated status for inactive users', async () => {
      const employees = await fetchEmployees('o1');
      expect(employees[1].status).toBe('terminated');
    });

    it('defaults contract_type to seasonal', async () => {
      mockGetByEmployeeIds.mockResolvedValueOnce([]);
      const employees = await fetchEmployees('o1');
      expect(employees[0].contract_type).toBe('seasonal');
    });

    it('defaults hourly_rate to 23.95', async () => {
      mockGetByEmployeeIds.mockResolvedValueOnce([]);
      const employees = await fetchEmployees('o1');
      expect(employees[0].hourly_rate).toBe(23.95);
    });

    it('handles Unknown name', async () => {
      mockGetAll.mockResolvedValueOnce([
        {
          id: 'u1',
          full_name: null,
          email: null,
          role: null,
          is_active: true,
          created_at: '2025-01-01',
        },
      ]);
      mockGetByEmployeeIds.mockResolvedValueOnce([]);
      const employees = await fetchEmployees('o1');
      expect(employees[0].full_name).toBe('Unknown');
      expect(employees[0].role).toBe('picker');
    });

    it('returns empty on error', async () => {
      mockGetAll.mockRejectedValueOnce(new Error('DB error'));
      const employees = await fetchEmployees('o1');
      expect(employees).toEqual([]);
    });
  });




  // ========== fetchPayroll ==========
  describe('fetchPayroll', () => {
    it('calculates payroll for active employees', async () => {
      const payroll = await fetchPayroll('o1');
      // En plantilla + quien trabajó esa semana aunque ya esté de baja (hay que pagarle)
      expect(payroll.map(p => p.employee_name)).toEqual(['Alice', 'Bob']);
      const alice = payroll[0];
      expect(alice.employee_name).toBe('Alice');
      expect(alice.hours_worked).toBe(7.5); // 8 h − 30 min de descanso no pagado
      expect(alice.buckets_picked).toBe(10);
      expect(alice.piece_earnings).toBe(70); // 10 × 7.00
      expect(alice.hourly_earnings).toBe(187.5); // 7.5 × 25 (tarifa del contrato)
      expect(alice.total_pay).toBe(187.5); // cubetas + complemento hasta el mínimo
      expect(alice.wage_shield_applied).toBe(true);
    });

    it('returns empty on error', async () => {
      mockGetAll.mockRejectedValueOnce(new Error('fail'));
      expect(await fetchPayroll('o1')).toEqual([]);
    });

    it('handles worker with 0 hours and 0 buckets', async () => {
      mockGetAll.mockResolvedValueOnce([
        {
          id: 'u3',
          full_name: 'Charlie',
          role: 'picker',
          is_active: true,
          created_at: '2025-01-01',
        },
      ]);
      mockGetByEmployeeIds.mockResolvedValueOnce([]);
      mockGetHoursSummary.mockResolvedValueOnce([]);
      mockGetBucketCounts.mockResolvedValueOnce([]);
      const payroll = await fetchPayroll('o1');
      expect(payroll[0].total_pay).toBe(0);
      expect(payroll[0].wage_shield_applied).toBe(false);
    });
  });

  // ========== fetchComplianceAlerts ==========
  describe('fetchComplianceAlerts', () => {
    it('returns expiring contract alerts', async () => {
      const alerts = await fetchComplianceAlerts('o1');
      const contractAlerts = alerts.filter(a => a.type === 'contract_expiry');
      expect(contractAlerts.length).toBe(2); // 1 expiring + 1 expired

      const expiring = contractAlerts.find(a => a.id.startsWith('contract-'));
      expect(expiring).toBeDefined();
      expect(expiring!.severity).toBe('critical'); // < 7 days

      const expired = contractAlerts.find(a => a.id.startsWith('expired-'));
      expect(expired).toBeDefined();
      expect(expired!.severity).toBe('critical');
      expect(expired!.message).toContain('expired');
    });

    it('severity is medium for > 14 days', async () => {
      mockGetExpiringSoon.mockResolvedValueOnce([
        {
          id: 'c5',
          employee_id: 'u1',
          type: 'seasonal',
          end_date: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
        },
      ]);
      mockGetExpiredButActive.mockResolvedValueOnce([]);
      const alerts = await fetchComplianceAlerts('o1');
      expect(alerts[0].severity).toBe('medium');
    });

    it('severity is high for 7-14 days', async () => {
      mockGetExpiringSoon.mockResolvedValueOnce([
        {
          id: 'c6',
          employee_id: 'u1',
          type: 'seasonal',
          end_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        },
      ]);
      mockGetExpiredButActive.mockResolvedValueOnce([]);
      const alerts = await fetchComplianceAlerts('o1');
      expect(alerts[0].severity).toBe('high');
    });

    it('returns empty on error', async () => {
      mockGetExpiringSoon.mockRejectedValueOnce(new Error('DB error'));
      const alerts = await fetchComplianceAlerts('o1');
      expect(alerts).toEqual([]);
    });

    it('returns empty when no issues', async () => {
      mockGetExpiringSoon.mockResolvedValueOnce([]);
      mockGetExpiredButActive.mockResolvedValueOnce([]);
      const alerts = await fetchComplianceAlerts('o1');
      expect(alerts).toEqual([]);
    });
  });
});
