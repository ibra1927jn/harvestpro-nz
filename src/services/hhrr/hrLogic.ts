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

/** Documento de RRHH de una persona (hr_documents, versión ligera) */
export interface PersonDoc extends VisaDoc {
  id: string;
  document_type: string;
  /** Contrato del que es copia firmada (employment_agreement) */
  contract_id: string | null;
  storage_path: string;
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

/**
 * Copia firmada de un contrato: documento employment_agreement enlazado por
 * contract_id que cubre la fecha de fin del contrato. Al subirla se le pone
 * expires_at = end_date; si luego el contrato se renueva (fin más lejano) la
 * copia antigua deja de cubrirlo y hace falta el PDF nuevo. Si hay varias,
 * la de fecha más lejana.
 */
export function signedCopyOf(
  contract: { id: string; end_date: string | null } | undefined,
  docs: PersonDoc[]
): PersonDoc | undefined {
  if (!contract) return undefined;
  return docs
    .filter(d => d.document_type === 'employment_agreement' && d.contract_id === contract.id)
    .filter(d => !contract.end_date || !d.expires_at || d.expires_at >= contract.end_date)
    .sort((a, b) => (b.expires_at ?? '9999').localeCompare(a.expires_at ?? '9999'))[0];
}

/**
 * Contratos pendientes de RRHH: los borradores y los que caducan, más los
 * activos sin copia firmada (la ley exige tener copia del acuerdo de empleo).
 */
export function pendingContractIds(
  contracts: { id: string; status: string; end_date: string | null }[],
  docs: PersonDoc[]
): string[] {
  return contracts
    .filter(c => c.status === 'draft' || c.status === 'expiring' || (c.status === 'active' && !signedCopyOf(c, docs)))
    .map(c => c.id);
}

/* ── Dominios de los filtros ─────────────────── */

/** Estado de la persona: todos los valores, salgan o no en la lista */
export const EMPLOYEE_STATUSES: ReadonlyArray<Employee['status']> = ['active', 'on_leave', 'pending', 'terminated'];
export const VISA_STATUSES: ReadonlyArray<Employee['visa_status']> = ['work_visa', 'expired', 'not_recorded'];
export const CONTRACT_TYPES: ReadonlyArray<Employee['contract_type']> = ['permanent', 'seasonal', 'casual'];

/**
 * Opciones de un filtro: el dominio completo con el recuento de cada valor.
 * Las de 0 se quedan (en gris) en vez de desaparecer: antes el filtro de
 * estado solo ofrecía "Activo" porque se sacaba de los valores presentes.
 */
export function domainOptions(
  domain: ReadonlyArray<string>,
  values: ReadonlyArray<string>
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return domain.map(value => ({ value, count: counts.get(value) ?? 0 }));
}

/* ── Alta completa ("qué falta") ───────────── */

export type OnboardingItem = 'contract' | 'signed_copy' | 'visa' | 'tax_declaration' | 'health_safety_cert';

/**
 * Lo que falta para dar el alta por completa: contrato activo, copia firmada
 * del acuerdo, visado vigente (caducado o sin registrar: no se sabe quién es
 * ciudadano), declaración de impuestos (IR330) y certificado de seguridad.
 * Un certificado caducado cuenta como que falta.
 */
export function missingOnboardingItems(
  employee: Pick<Employee, 'id' | 'visa_status'>,
  documents: PersonDoc[],
  contract: { id: string; end_date: string | null } | undefined,
  todayNZ: string
): OnboardingItem[] {
  const mine = documents.filter(d => d.picker_id === employee.id || d.user_id === employee.id);
  const valid = (type: string) => mine.some(d => d.document_type === type && (!d.expires_at || d.expires_at >= todayNZ));
  const out: OnboardingItem[] = [];
  if (!contract) out.push('contract');
  else if (!signedCopyOf(contract, mine)) out.push('signed_copy');
  if (employee.visa_status !== 'work_visa') out.push('visa');
  if (!mine.some(d => d.document_type === 'tax_declaration')) out.push('tax_declaration');
  if (!valid('health_safety_cert')) out.push('health_safety_cert');
  return out;
}

/**
 * Estado de la persona: baja → terminated; ausencia aprobada que cubre hoy →
 * on_leave; alta sin contrato activo o sin copia firmada → pending; si no, active.
 * (El visado y los certificados salen en el semáforo pero no bloquean el alta:
 * no se registra quién es ciudadano.)
 */
export function employeeStatusOf(
  active: boolean,
  onLeaveToday: boolean,
  missing: ReadonlyArray<OnboardingItem>
): Employee['status'] {
  if (!active) return 'terminated';
  if (onLeaveToday) return 'on_leave';
  if (missing.includes('contract') || missing.includes('signed_copy')) return 'pending';
  return 'active';
}

/** Datos de contexto que la ficha no saca de la persona ni del contrato */
export interface EmployeeContext {
  /** Documentos de toda la empresa (visados, copias firmadas, certificados…) */
  documents?: PersonDoc[];
  /** Personas con una ausencia aprobada que cubre hoy (leave_requests) */
  onLeaveToday?: ReadonlySet<string>;
}

/** Ficha de empleado a partir de la persona, su contrato vigente y sus documentos */
export function buildEmployee(
  person: StaffPerson,
  contracts: ActiveContractRow[],
  visas: VisaDoc[],
  todayNZ: string,
  nowISO: string,
  ctx: EmployeeContext = {}
): Employee {
  const contract = contracts.find(c => c.employee_id === person.id);
  const visa = latestVisaFor(person.id, visas);
  const documents = ctx.documents ?? [];
  const signed = signedCopyOf(contract, documents);
  const visa_status = visaStatusOf(visa, todayNZ);
  const missing = missingOnboardingItems({ id: person.id, visa_status }, documents, contract, todayNZ);
  return {
    id: person.id,
    full_name: person.full_name,
    email: person.email,
    role: person.role,
    status: employeeStatusOf(person.active, ctx.onLeaveToday?.has(person.id) ?? false, missing),
    contract_type: (contract?.type || 'seasonal') as Employee['contract_type'],
    contract_start: contract?.start_date || person.created_at || nowISO,
    contract_end: contract?.end_date || undefined,
    hourly_rate: contract?.hourly_rate || NZ_MINIMUM_WAGE_2026,
    visa_status,
    visa_expiry: visa?.expires_at ?? undefined,
    contract_id: contract?.id,
    contract_updated_at: contract?.updated_at ?? undefined,
    contract_document: signed ? { id: signed.id, storage_path: signed.storage_path } : undefined,
    missing_items: missing,
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
 * Filas de nómina: salen las personas en plantilla (activas, de permiso o con
 * el alta a medias) y cualquiera que haya cobrado.
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
    .filter(e => e.status !== 'terminated' || payById.has(e.id))
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
