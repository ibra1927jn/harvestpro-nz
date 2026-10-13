/**
 * hrLogic — lógica pura de RRHH (sin Supabase): ficha de empleado, filas de
 * nómina semanal y alertas de contratos y documentos.
 */
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import type { ComplianceAlert, Employee, PayrollEntry } from './hhrr.types';

const DAY_MS = 86400000;

/* ── Empleados ─────────────────────────────── */

export interface StaffPerson {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  created_at?: string;
  orchard_id?: string;
  source: 'staff' | 'office';
}

export interface ActiveContractRow {
  id: string;
  employee_id: string;
  type: string | null;
  start_date: string | null;
  end_date: string | null;
  hourly_rate: number | null;
  updated_at: string | null;
}

export interface VisaDoc {
  picker_id: string | null;
  user_id: string | null;
  expires_at: string | null;
}

/** Visado: el documento "Work Visa" más reciente; sin documento = not_recorded */
export function latestVisaFor(personId: string, visas: VisaDoc[]): VisaDoc | undefined {
  return visas
    .filter(d => d.picker_id === personId || d.user_id === personId)
    .sort((a, b) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0];
}

export function visaStatusOf(visa: VisaDoc | undefined, todayNZ: string): Employee['visa_status'] {
  if (!visa) return 'not_recorded';
  return visa.expires_at && visa.expires_at < todayNZ ? 'expired' : 'work_visa';
}

/** Ficha de empleado a partir de la persona, su contrato vigente y su visado */
export function buildEmployee(
  person: StaffPerson,
  contracts: ActiveContractRow[],
  visas: VisaDoc[],
  todayNZ: string,
  nowISO: string
): Employee {
  const contract = contracts.find(c => c.employee_id === person.id);
  const visa = latestVisaFor(person.id, visas);
  return {
    id: person.id,
    full_name: person.full_name,
    email: person.email,
    role: person.role,
    status: person.active ? 'active' : 'terminated',
    contract_type: (contract?.type || 'seasonal') as Employee['contract_type'],
    contract_start: contract?.start_date || person.created_at || nowISO,
    contract_end: contract?.end_date || undefined,
    hourly_rate: contract?.hourly_rate || NZ_MINIMUM_WAGE_2026,
    visa_status: visaStatusOf(visa, todayNZ),
    visa_expiry: visa?.expires_at ?? undefined,
    contract_id: contract?.id,
    contract_updated_at: contract?.updated_at ?? undefined,
    source: person.source,
    hire_date: person.created_at || nowISO,
    orchard_id: person.orchard_id,
  };
}

/* ── Nómina semanal ────────────────────────── */

/** Pago de una persona en la semana (de calculate-payroll o del cálculo local) */
export interface WeekPayRow {
  id: string;
  hours: number;
  buckets: number;
  piece: number;
  topUp: number;
  total: number;
}

/**
 * Filas de nómina: salen las personas activas y cualquiera que haya cobrado.
 * El mínimo garantizado es la tarifa del contrato si es mayor que el general.
 */
export function buildPayrollEntries(
  employees: Employee[],
  rows: WeekPayRow[],
  minWage: number,
  week: { start: string; end: string }
): PayrollEntry[] {
  const payById = new Map(rows.map(r => [r.id, r]));
  return employees
    .filter(e => e.status === 'active' || payById.has(e.id))
    .map(emp => {
      const p = payById.get(emp.id);
      const hours = p?.hours ?? 0;
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
}

/* ── Alertas ───────────────────────────────── */

/** Severidad de un contrato que caduca: <7 días crítica, <14 alta, si no media */
export function contractExpirySeverity(days: number): ComplianceAlert['severity'] {
  return days < 7 ? 'critical' : days < 14 ? 'high' : 'medium';
}

/** Severidad de un documento: caducado crítica, <7 días alta, si no media */
export function documentExpirySeverity(days: number): ComplianceAlert['severity'] {
  return days < 0 ? 'critical' : days < 7 ? 'high' : 'medium';
}

export function contractExpiryAlerts(
  contracts: { id: string; employee_id: string; type: string; end_date: string }[],
  names: Record<string, string>,
  nowMs: number
): ComplianceAlert[] {
  const createdAt = new Date(nowMs).toISOString();
  return contracts.map(c => {
    const days = Math.floor((new Date(c.end_date).getTime() - nowMs) / DAY_MS);
    return {
      id: `contract-${c.id}`,
      type: 'contract_expiry' as const,
      severity: contractExpirySeverity(days),
      employee_id: c.employee_id,
      employee_name: names[c.employee_id] || 'Unknown',
      message: `${c.type} contract expires in ${days} days (${c.end_date})`,
      created_at: createdAt,
      resolved: false,
    };
  });
}

export function expiredContractAlerts(
  contracts: { id: string; employee_id: string }[],
  names: Record<string, string>,
  nowISO: string
): ComplianceAlert[] {
  return contracts.map(c => ({
    id: `expired-${c.id}`,
    type: 'contract_expiry' as const,
    severity: 'critical' as const,
    employee_id: c.employee_id,
    employee_name: names[c.employee_id] || 'Unknown',
    message: 'Contract has expired but is still marked as active',
    created_at: nowISO,
    resolved: false,
  }));
}

export interface ExpiringDoc {
  id: string;
  picker_id: string | null;
  user_id: string | null;
  document_type: string;
  expires_at: string | null;
}

/** Documentos (visados, certificados…) caducados o que caducan pronto */
export function documentExpiryAlerts(
  docs: ExpiringDoc[],
  names: Record<string, string>,
  todayNZ: string,
  labels: Record<string, string>,
  nowISO: string
): ComplianceAlert[] {
  const out: ComplianceAlert[] = [];
  for (const d of docs) {
    if (!d.expires_at) continue;
    const days = Math.round((Date.parse(d.expires_at) - Date.parse(todayNZ)) / DAY_MS);
    const who = (d.picker_id || d.user_id) as string;
    const label = labels[d.document_type];
    out.push({
      id: `doc-${d.id}`,
      type: d.document_type === 'work_visa' ? 'visa_expiry' : 'missing_document',
      severity: documentExpirySeverity(days),
      employee_id: who,
      employee_name: names[who] || 'Unknown',
      message: days < 0
        ? `${label} expired ${Math.abs(days)} days ago (${d.expires_at})`
        : `${label} expires in ${days} days (${d.expires_at})`,
      created_at: nowISO,
      resolved: false,
    });
  }
  return out;
}
