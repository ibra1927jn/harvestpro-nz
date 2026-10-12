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
import { payrollService } from '@/services/payroll.service';
import { storeSyncRepository } from '@/repositories/store-sync.repository';
import { syncService } from '@/services/sync.service';
import { logger } from '@/utils/logger';
import { todayNZST, nzMidnight } from '@/utils/nzst';
import { userRepository2 } from '@/repositories/user.repository';
import { contractRepository2 } from '@/repositories/contract.repository';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import { payForRange, payWeekOf, nzDateOf, pieceRateFor, PAY_RULES, type PickerRangePay } from '@/services/harvestMetrics';
import { payRatesRepository } from '@/repositories/pay-rates.repository';
import { hrDocumentsRepository, HR_DOCUMENT_TYPE_LABELS } from '@/repositories/hr-documents.repository';

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
  /** Del visado de trabajo subido en Documentos (no se inventa: sin documento = not_recorded) */
  visa_status: 'work_visa' | 'expired' | 'not_recorded';
  visa_expiry?: string;
  /** Contrato vigente (si tiene) */
  contract_id?: string;
  contract_updated_at?: string;
  /** staff = plantilla (pickers, TL, runners); office = cuenta de oficina */
  source?: 'staff' | 'office';
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

    // Mismo total que la pantalla de Nómina (empresa, todos los huertos);
    // si el servidor no responde, se calcula aquí con el mismo cálculo.
    let payrollThisWeek: number;
    try {
      const week = payWeekOf(todayNZST());
      const result = await payrollService.calculatePayroll(undefined, week.start, week.end);
      payrollThisWeek = result.summary.total_earnings;
    } catch {
      const week = await loadPayWeek(orchardId);
      payrollThisWeek = Math.round(week.pay.reduce((sum, p) => sum + p.total, 0) * 100) / 100;
    }

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

/**
 * Empleados de la empresa: la plantilla única (la misma lista que Equipos y
 * Nómina: pickers, team leaders, runners) más el personal de oficina con cuenta.
 * Antes salían solo las cuentas de la app y no aparecía ningún picker.
 * orchardId se ignora: la gente rota entre huertos de la misma empresa.
 */
export async function fetchEmployees(_orchardId?: string): Promise<Employee[]> {
  try {
    const staff = await userRepository2.getStaff();
    const [contracts, visas] = await Promise.all([
      contractRepository2.getByEmployeeIds(staff.map(s => s.id)),
      hrDocumentsRepository.listWorkVisas().catch(() => []),
    ]);
    const today = todayNZST();

    return staff.map(person => {
      const contract = contracts.find(c => c.employee_id === person.id);
      // Visado: el documento "Work Visa" más reciente de esa persona
      const visa = visas
        .filter(d => d.picker_id === person.id || d.user_id === person.id)
        .sort((a, b) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0];
      const visa_status: Employee['visa_status'] = !visa
        ? 'not_recorded'
        : visa.expires_at && visa.expires_at < today ? 'expired' : 'work_visa';
      return {
        id: person.id,
        full_name: person.full_name,
        email: person.email,
        role: person.role,
        status: person.active ? ('active' as const) : ('terminated' as const),
        contract_type: (contract?.type || 'seasonal') as 'permanent' | 'seasonal' | 'casual',
        contract_start: contract?.start_date || person.created_at || new Date().toISOString(),
        contract_end: contract?.end_date || undefined,
        hourly_rate: contract?.hourly_rate || NZ_MINIMUM_WAGE_2026,
        visa_status,
        visa_expiry: visa?.expires_at ?? undefined,
        contract_id: contract?.id,
        contract_updated_at: contract?.updated_at ?? undefined,
        source: person.source,
        hire_date: person.created_at || new Date().toISOString(),
        orchard_id: person.orchard_id,
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

/**
 * Crear contrato (RRHH). Directo, no por la cola: RRHH trabaja en oficina con
 * conexión y necesita saber al momento si se guardó.
 */
export async function saveNewContract(contract: {
  employee_id: string;
  orchard_id: string;
  type: 'permanent' | 'seasonal' | 'casual';
  start_date: string;
  end_date?: string | null;
  hourly_rate: number;
  notes?: string | null;
  created_by?: string | null;
}): Promise<void> {
  if (contract.hourly_rate < PAY_RULES.minWageFloor) {
    throw new Error(`Hourly rate cannot be below the NZ minimum wage ($${PAY_RULES.minWageFloor}/h)`);
  }
  await contractRepository2.insertOne({ ...contract, end_date: contract.end_date || null, status: 'active' });
}

/** Cambiar un contrato existente (renovar, terminar, tarifa, fecha fin) por su id */
export async function changeContract(
  contractId: string,
  updates: { status?: 'active' | 'terminated'; end_date?: string | null; hourly_rate?: number; notes?: string }
): Promise<void> {
  if (updates.hourly_rate !== undefined && updates.hourly_rate < PAY_RULES.minWageFloor) {
    throw new Error(`Hourly rate cannot be below the NZ minimum wage ($${PAY_RULES.minWageFloor}/h)`);
  }
  await contractRepository2.updateOne(contractId, updates);
}

/**
 * Alta / baja de una persona desde RRHH: plantilla → pickers.status;
 * oficina → users.is_active.
 */
export async function setEmployeeActive(emp: Pick<Employee, 'id' | 'source'>, active: boolean): Promise<void> {
  await userRepository2.setActive(emp.id, emp.source ?? 'staff', active);
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
async function loadPayWeek(orchardId?: string, minWageFor?: (personId: string) => number) {
  const week = payWeekOf(todayNZST());
  const [attendance, buckets, rates] = await Promise.all([
    attendanceRepository.getHoursSummary(orchardId, week.start),
    // Medianoche NZ del lunes; una fecha sola compara con 00:00 UTC (13:00 NZDT)
    storeSyncRepository.getBucketCounts(orchardId, nzMidnight(week.start)),
    payRatesRepository.load().catch(() => ({ varietyRates: [], orchardRates: {} })),
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
      orchardId: a.orchard_id,
      date: a.date ?? (a.check_in ? nzDateOf(a.check_in) : week.start),
      checkIn: a.check_in,
      checkOut: a.check_out,
      breakStart: a.break_start,
      breakMinutes: a.break_minutes,
    }));
  const bucketRows = (buckets || [])
    .filter(b => !b.deleted_at && b.scanned_at)
    .map(b => ({
      pickerId: b.picker_id,
      scannedAt: b.scanned_at as string,
      qualityGrade: b.quality_grade,
      orchardId: b.orchard_id,
      variety: b.variety,
      pieceRate: pieceRateFor({ orchardId: b.orchard_id, variety: b.variety }, { ...rates, fallback: pieceRate }),
    }));

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

/**
 * Nómina de la semana por persona, con las MISMAS cifras que la pantalla de
 * Nómina (calculate-payroll, empresa entera: todos los huertos, trayectos,
 * precio por variedad). Si el servidor no responde, el mismo cálculo aquí.
 * Salen las personas en plantilla y cualquiera que haya cobrado esa semana.
 */
export async function fetchPayroll(orchardId?: string): Promise<PayrollEntry[]> {
  try {
    const employees = await fetchEmployees(orchardId);
    const week = payWeekOf(todayNZST());

    let rows: { id: string; hours: number; buckets: number; piece: number; topUp: number; total: number }[];
    let minWage: number = PAY_RULES.minWageFloor;
    try {
      const result = await payrollService.calculatePayroll(undefined, week.start, week.end);
      minWage = Math.max(result.settings.min_wage_rate, PAY_RULES.minWageFloor);
      rows = result.picker_breakdown.map(p => ({
        id: p.picker_id, hours: p.hours_worked, buckets: p.buckets,
        piece: p.piece_rate_earnings, topUp: p.top_up_required, total: p.total_earnings,
      }));
    } catch {
      // Mismo cálculo aquí; el mínimo de cada persona es la tarifa de su contrato si es mayor
      const rateById = new Map(employees.map(e => [e.id, e.hourly_rate]));
      const fallback = await loadPayWeek(orchardId, id => Math.max(rateById.get(id) ?? 0, PAY_RULES.minWageFloor));
      rows = fallback.pay.map(p => ({
        id: p.pickerId, hours: p.hours, buckets: p.buckets,
        piece: p.pieceEarnings, topUp: p.topUp, total: p.total,
      }));
    }
    const payById = new Map(rows.map(r => [r.id, r]));
    const people = employees.filter(e => e.status === 'active' || payById.has(e.id));

    return people.map(emp => {
      const p = payById.get(emp.id);
      const hours = p?.hours ?? 0;
      // Mínimo garantizado: tarifa del contrato si es mayor que el mínimo general
      const personMin = Math.max(emp.hourly_rate, minWage);
      return {
        id: `payroll-${emp.id}`,
        employee_id: emp.id,
        employee_name: emp.full_name,
        role: emp.role,
        hours_worked: hours,
        buckets_picked: p?.buckets ?? 0,
        hourly_earnings: Math.round(hours * personMin * 100) / 100,
        piece_earnings: p?.piece ?? 0,
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

  // Documentos (visados, certificados…) caducados o que caducan en 30 días
  try {
    const docs = await hrDocumentsRepository.listExpiringCompany(30);
    if (docs.length > 0) {
      const ids = docs.map(d => (d.picker_id || d.user_id) as string).filter(Boolean);
      const names = await userRepository2.getNamesByIds(ids);
      const today = todayNZST();
      for (const d of docs) {
        if (!d.expires_at) continue;
        const days = Math.round((Date.parse(d.expires_at) - Date.parse(today)) / 86400000);
        const who = (d.picker_id || d.user_id) as string;
        alerts.push({
          id: `doc-${d.id}`,
          type: d.document_type === 'work_visa' ? 'visa_expiry' : 'missing_document',
          severity: days < 0 ? 'critical' : days < 7 ? 'high' : 'medium',
          employee_id: who,
          employee_name: names[who] || 'Unknown',
          message: days < 0
            ? `${HR_DOCUMENT_TYPE_LABELS[d.document_type]} expired ${Math.abs(days)} days ago (${d.expires_at})`
            : `${HR_DOCUMENT_TYPE_LABELS[d.document_type]} expires in ${days} days (${d.expires_at})`,
          created_at: new Date().toISOString(),
          resolved: false,
        });
      }
    }
  } catch (error) {
    logger.warn('[HHRR] Could not check document expiries:', error);
  }

  return alerts;
}
