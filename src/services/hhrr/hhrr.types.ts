/**
 * Tipos de RRHH (HHRR): empleados, nómina semanal, alertas y resumen.
 */

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
  /** Copia firmada del contrato vigente (hr_documents employment_agreement con contract_id) */
  contract_document?: { id: string; storage_path: string };
  /** Lo que falta para el alta completa (semáforo); contrato / copia firmada ponen status = pending */
  missing_items?: ('contract' | 'signed_copy' | 'visa' | 'tax_declaration' | 'health_safety_cert')[];
  /** staff = plantilla (pickers, TL, runners); office = cuenta de oficina */
  source?: 'staff' | 'office';
  phone?: string;
  emergency_contact?: string;
  hire_date: string;
  orchard_id?: string;
  team_id?: string;
  documents_count?: number;
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
