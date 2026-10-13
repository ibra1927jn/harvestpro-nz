/**
 * HHRR Service — Human Resources Department
 * Handles employee management, contracts, payroll, and compliance for HR_ADMIN role
 *
 * Architecture:
 *   READS  → Via domain repositories (attendance, user, contract)
 *   WRITES → directas (RRHH trabaja en oficina con conexión)
 *   Lógica pura (ficha, nómina, alertas): hhrr/hrLogic.ts · Tipos: hhrr/hhrr.types.ts
 */
import { settingsRepository } from '@/repositories/settings.repository';
import { payrollService } from '@/services/payroll.service';
import { storeSyncRepository } from '@/repositories/store-sync.repository';
import { logger } from '@/utils/logger';
import { todayNZST, nzMidnight } from '@/utils/nzst';
import { userRepository2 } from '@/repositories/user.repository';
import { contractRepository2 } from '@/repositories/contract.repository';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { payForRange, payWeekOf, nzDateOf, pieceRateFor, PAY_RULES, type PickerRangePay } from '@/services/harvestMetrics';
import { payRatesRepository } from '@/repositories/pay-rates.repository';
import { hrDocumentsRepository, HR_DOCUMENT_TYPE_LABELS } from '@/repositories/hr-documents.repository';
import type { ComplianceAlert, Employee, HRSummary, PayrollEntry } from './hhrr/hhrr.types';
import {
  buildEmployee,
  buildPayrollEntries,
  contractExpiryAlerts,
  documentExpiryAlerts,
  expiredContractAlerts,
  type WeekPayRow,
} from './hhrr/hrLogic';

// Tipos en hhrr/hhrr.types.ts; se re-exportan para no cambiar los imports
export type { Employee, PayrollEntry, ComplianceAlert, HRSummary } from './hhrr/hhrr.types';

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
    const nowISO = new Date().toISOString();
    return staff.map(person => buildEmployee(person, contracts, visas, today, nowISO));
  } catch (error) {
    logger.error('[HHRR] Error fetching employees:', error);
    return [];
  }
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

    let rows: WeekPayRow[];
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
    return buildPayrollEntries(employees, rows, minWage, week);
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

    const expiringContracts = await contractRepository2.getExpiringSoon(orchardId, today, thirtyDaysFromNow);
    if (expiringContracts.length > 0) {
      const names = await userRepository2.getNamesByIds(expiringContracts.map(c => c.employee_id));
      alerts.push(...contractExpiryAlerts(expiringContracts, names, Date.now()));
    }

    const expired = await contractRepository2.getExpiredButActive(orchardId);
    if (expired.length > 0) {
      const names = await userRepository2.getNamesByIds(expired.map(c => c.employee_id));
      alerts.push(...expiredContractAlerts(expired, names, new Date().toISOString()));
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
      alerts.push(...documentExpiryAlerts(docs, names, todayNZST(), HR_DOCUMENT_TYPE_LABELS, new Date().toISOString()));
    }
  } catch (error) {
    logger.warn('[HHRR] Could not check document expiries:', error);
  }

  return alerts;
}
