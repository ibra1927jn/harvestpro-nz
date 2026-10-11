/**
 * HHRR Service — Human Resources Department
 * Handles employee management, contracts, payroll, and compliance for HR_ADMIN role
 *
 * Architecture:
 *   READS  → Via domain repositories (attendance, user, contract)
 *   WRITES → Via syncService.addToQueue() for offline-first
 *   Conflict Resolution: Last-write-wins (documented decision)
 */
import { settingsRepository } from '@/repositories/settings.repository';
import { storeSyncRepository } from '@/repositories/store-sync.repository';
import { syncService } from '@/services/sync.service';
import { logger } from '@/utils/logger';
import { todayNZST } from '@/utils/nzst';
import { userRepository2 } from '@/repositories/user.repository';
import { contractRepository2 } from '@/repositories/contract.repository';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import { payForRange, payWeekOf, nzDateOf, PAY_RULES, type PickerRangePay } from '@/services/harvestMetrics';

// ── Types ──────────────────────────────────────
export interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: 'active' | 'on_leave' | 'terminated' | 'pending';
  contract_type: 'permanent' | 'seasonal' | 'casual';
  contract_start: string;
  contract_end?: string;
  hourly_rate: number;
  visa_status: 'citizen' | 'resident' | 'work_visa' | 'expired';
  visa_expiry?: string;
  phone?: string;
  emergency_contact?: string;
  hire_date: string;
  orchard_id?: string;
  team_id?: string;
  documents_count?: number;
}

export interface Contract {
  id: string;
  employee_id: string;
  employee_name: string;
  type: 'permanent' | 'seasonal' | 'casual';
  status: 'active' | 'expiring' | 'expired' | 'draft' | 'terminated';
  start_date: string;
  end_date?: string;
  hourly_rate: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  role: string;
  hours_worked: number;
  buckets_picked: number;
  hourly_earnings: number;
  piece_earnings: number;
  total_pay: number;
  wage_shield_applied: boolean;
  period_start: string;
  period_end: string;
}

export interface ComplianceAlert {
  id: string;
  type: 'visa_expiry' | 'wage_violation' | 'missing_document' | 'contract_expiry';
  severity: 'low' | 'medium' | 'high' | 'critical';
  employee_id: string;
  employee_name: string;
  message: string;
  created_at: string;
  resolved: boolean;
}

export interface HRSummary {
  activeWorkers: number;
  pendingContracts: number;
  payrollThisWeek: number;
  complianceAlerts: number;
}

// ── Service Functions ──────────────────────────

export async function fetchHRSummary(orchardId?: string): Promise<HRSummary> {
  try {
    const activeWorkers = await userRepository2.getActiveCount(orchardId);
    const pending = await contractRepository2.getPending(orchardId);
    const alerts = await fetchComplianceAlerts(orchardId);

    const week = await loadPayWeek(orchardId);
    const payrollThisWeek =
      Math.round(week.pay.reduce((sum, p) => sum + p.total, 0) * 100) / 100;

    return {
      activeWorkers,
      pendingContracts: pending.length,
      payrollThisWeek,
      complianceAlerts: alerts.length,
    };
  } catch (error) {
    logger.error('[HHRR] Error fetching HR summary:', error);
    return { activeWorkers: 0, pendingContracts: 0, payrollThisWeek: 0, complianceAlerts: 0 };
  }
}

export async function fetchEmployees(orchardId?: string): Promise<Employee[]> {
  try {
    const data = await userRepository2.getAll(orchardId);
    const userIds = data.map(u => u.id);
    const contracts = await contractRepository2.getByEmployeeIds(userIds);

    return data.map(user => {
      const contract = contracts.find(c => c.employee_id === user.id);
      return {
        id: user.id,
        full_name: user.full_name || 'Unknown',
        email: user.email || '',
        role: user.role || 'picker',
        status: user.is_active ? ('active' as const) : ('terminated' as const),
        contract_type: (contract?.type || 'seasonal') as 'permanent' | 'seasonal' | 'casual',
        contract_start: contract?.start_date || user.created_at || new Date().toISOString(),
        contract_end: contract?.end_date || undefined,
        hourly_rate: contract?.hourly_rate || NZ_MINIMUM_WAGE_2026,
        visa_status: 'citizen' as const,
        hire_date: user.created_at || new Date().toISOString(),
        orchard_id: user.orchard_id,
      };
    });
  } catch (error) {
    logger.error('[HHRR] Error fetching employees:', error);
    return [];
  }
}

export async function fetchContracts(orchardId?: string): Promise<Contract[]> {
  try {
    const data = await contractRepository2.getAll(orchardId);
    const employeeIds = [...new Set(data.map(c => c.employee_id))];
    const names = await userRepository2.getNamesByIds(employeeIds);

    return data.map(c => ({
      id: c.id,
      employee_id: c.employee_id,
      employee_name: names[c.employee_id] || 'Unknown',
      type: c.type,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date || undefined,
      hourly_rate: c.hourly_rate,
      notes: c.notes || undefined,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
  } catch (error) {
    logger.error('[HHRR] Error fetching contracts:', error);
    return [];
  }
}

export async function createContract(contract: {
  employee_id: string;
  orchard_id: string;
  type: 'permanent' | 'seasonal' | 'casual';
  start_date: string;
  end_date?: string;
  hourly_rate: number;
  notes?: string;
}): Promise<string> {
  return syncService.addToQueue('CONTRACT', { action: 'create', ...contract });
}

export async function updateContract(
  contractId: string,
  updates: {
    status?: string;
    end_date?: string;
    hourly_rate?: number;
    notes?: string;
  },
  currentUpdatedAt?: string
): Promise<string> {
  return syncService.addToQueue(
    'CONTRACT',
    { action: 'update', contractId, ...updates },
    currentUpdatedAt
  );
}

/**
 * Datos de la semana de pago en curso (lunes–domingo, NZ) y pago por persona
 * con el cálculo único (pay.ts): descanso no pagado, complemento al mínimo por día.
 */
function nzMidnight(dateYMD: string): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dateYMD}T12:00:00Z`))
    .find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+13:00';
  return `${dateYMD}T00:00:00${offset}`;
}

async function loadPayWeek(orchardId?: string, minWageFor?: (personId: string) => number) {
  const week = payWeekOf(todayNZST());
  const [attendance, buckets] = await Promise.all([
    attendanceRepository.getHoursSummary(orchardId, week.start),
    // Medianoche NZ del lunes; una fecha sola compara con 00:00 UTC (13:00 NZDT)
    storeSyncRepository.getBucketCounts(orchardId, nzMidnight(week.start)),
  ]);

  let pieceRate = 6.5;
  let orchardMinWage: number = PAY_RULES.minWageFloor;
  if (orchardId) {
    const settings = await settingsRepository.getByOrchardId(orchardId);
    if (settings?.piece_rate) pieceRate = settings.piece_rate;
    if (settings?.min_wage_rate) orchardMinWage = settings.min_wage_rate;
  }

  const attendanceRows = (attendance || [])
    .filter(a => !a.date || a.date <= week.end)
    .map(a => ({
      pickerId: a.picker_id,
      date: a.date ?? (a.check_in ? nzDateOf(a.check_in) : week.start),
      checkIn: a.check_in,
      checkOut: a.check_out,
      breakStart: a.break_start,
      breakMinutes: a.break_minutes,
    }));
  const bucketRows = (buckets || [])
    .filter(b => !b.deleted_at && b.scanned_at)
    .map(b => ({ pickerId: b.picker_id, scannedAt: b.scanned_at as string, qualityGrade: b.quality_grade }));

  const people = new Set<string>([...attendanceRows.map(a => a.pickerId), ...bucketRows.map(b => b.pickerId)]);
  const pay: PickerRangePay[] = [];
  for (const id of people) {
    const [row] = payForRange({
      attendance: attendanceRows.filter(a => a.pickerId === id),
      buckets: bucketRows.filter(b => b.pickerId === id),
      pieceRate,
      minWage: minWageFor?.(id) ?? orchardMinWage,
    });
    if (row) pay.push(row);
  }
  return { week, pay, pieceRate };
}

export async function fetchPayroll(orchardId?: string): Promise<PayrollEntry[]> {
  try {
    const employees = await fetchEmployees(orchardId);
    const activeEmployees = employees.filter(e => e.status === 'active');
    const rateById = new Map(activeEmployees.map(e => [e.id, e.hourly_rate]));

    const { week, pay } = await loadPayWeek(orchardId, id => rateById.get(id) ?? PAY_RULES.minWageFloor);
    const payById = new Map(pay.map(p => [p.pickerId, p]));

    return activeEmployees.map(emp => {
      const p = payById.get(emp.id);
      const hours = p?.hours ?? 0;
      const minWage = Math.max(emp.hourly_rate, PAY_RULES.minWageFloor);
      return {
        id: `payroll-${emp.id}`,
        employee_id: emp.id,
        employee_name: emp.full_name,
        role: emp.role,
        hours_worked: hours,
        buckets_picked: p?.buckets ?? 0,
        hourly_earnings: Math.round(hours * minWage * 100) / 100,
        piece_earnings: p?.pieceEarnings ?? 0,
        total_pay: p?.total ?? 0,
        wage_shield_applied: (p?.topUp ?? 0) > 0,
        period_start: week.start,
        period_end: week.end,
      };
    });
  } catch (error) {
    logger.error('[HHRR] Error generating payroll:', error);
    return [];
  }
}

export async function fetchComplianceAlerts(orchardId?: string): Promise<ComplianceAlert[]> {
  const alerts: ComplianceAlert[] = [];

  try {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const expiringContracts = await contractRepository2.getExpiringSoon(
      orchardId,
      today,
      thirtyDaysFromNow
    );

    if (expiringContracts.length > 0) {
      const ids = expiringContracts.map(c => c.employee_id);
      const names = await userRepository2.getNamesByIds(ids);

      expiringContracts.forEach(c => {
        const daysUntilExpiry = Math.floor(
          (new Date(c.end_date).getTime() - Date.now()) / 86400000
        );
        alerts.push({
          id: `contract-${c.id}`,
          type: 'contract_expiry',
          severity: daysUntilExpiry < 7 ? 'critical' : daysUntilExpiry < 14 ? 'high' : 'medium',
          employee_id: c.employee_id,
          employee_name: names[c.employee_id] || 'Unknown',
          message: `${c.type} contract expires in ${daysUntilExpiry} days (${c.end_date})`,
          created_at: new Date().toISOString(),
          resolved: false,
        });
      });
    }

    const expired = await contractRepository2.getExpiredButActive(orchardId);
    if (expired.length > 0) {
      const ids = expired.map(c => c.employee_id);
      const names = await userRepository2.getNamesByIds(ids);

      expired.forEach(c => {
        alerts.push({
          id: `expired-${c.id}`,
          type: 'contract_expiry',
          severity: 'critical',
          employee_id: c.employee_id,
          employee_name: names[c.employee_id] || 'Unknown',
          message: 'Contract has expired but is still marked as active',
          created_at: new Date().toISOString(),
          resolved: false,
        });
      });
    }
  } catch (error) {
    logger.error('[HHRR] Error fetching compliance alerts:', error);
  }

  return alerts;
}
