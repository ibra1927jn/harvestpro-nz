/**
 * Esquemas Zod de los payloads de la cola de sincronización.
 * Módulo aparte para que sync.service lo cargue con import() al procesar la cola:
 * así zod no va en el bundle inicial (login / runner).
 */
import { z } from 'zod';
import { QcCriteriaSchema } from '@/schemas/zod.schemas';

// 🔧 BUG-3 fix: Zod schemas for sync queue payload validation
// Replaces unsafe `as unknown as` double-casts that silenced corrupt payloads
export const ScanPayloadSchema = z
  .object({
    picker_id: z.string(),
    orchard_id: z.string(),
    row_number: z.number().optional(),
    quality_grade: z.string().optional(),
    bin_id: z.string().optional(),
    scanned_by: z.string(),
  })
  .passthrough();

export const AssignmentPayloadSchema = z.object({
  userId: z.string(),
  orchardId: z.string(),
});

export const MessagePayloadSchema = z.object({
  receiverId: z.string(),
  content: z.string(),
  type: z.string().optional(),
});

// 🔧 BUG-3 fix continued: Zod schemas for remaining sync payload types
export const ContractPayloadSchema = z.object({
  action: z.enum(['create', 'update']),
  contractId: z.string().optional(),
  employee_id: z.string().optional(),
  orchard_id: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  hourly_rate: z.number().optional(),
  notes: z.string().optional(),
});

export const TransportPayloadSchema = z.object({
  action: z.enum(['create', 'assign', 'complete', 'cancel']),
  /** id de la petición generado en el móvil (create idempotente) */
  id: z.string().optional(),
  requestId: z.string().optional(),
  vehicleId: z.string().optional(),
  assignedBy: z.string().optional(),
  orchard_id: z.string().optional(),
  requested_by: z.string().optional(),
  requester_name: z.string().optional(),
  zone: z.string().optional(),
  bins_count: z.number().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
});

export const TimesheetPayloadSchema = z.object({
  action: z.enum(['approve', 'reject']),
  attendanceId: z.string(),
  verifiedBy: z.string(),
  notes: z.string().optional(),
});

export const PickerPayloadSchema = z.object({
  id: z.string(),
  picker_id: z.string(),
  name: z.string(),
  orchard_id: z.string(),
  status: z.string().optional(),
  role: z.string().optional(),
  team_leader_id: z.string().nullable().optional(),
}).passthrough();

// Inspección con criterios (revisión 2026-10-21, punto 15). Este esquema es
// estricto (sin passthrough): si no lista las columnas nuevas, zod las quita
// del payload encolado y la inspección llega a la BD solo con la nota.
export const QCInspectionPayloadSchema = z.object({
  orchard_id: z.string(),
  picker_id: z.string(),
  inspector_id: z.string(),
  grade: z.enum(['A', 'B', 'C', 'reject']),
  notes: z.string().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  /** {ladder: 'ok'|'warn'|'bad', ...}; null = inspección solo con nota */
  criteria: QcCriteriaSchema.nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  row_number: z.number().int().min(0).max(9999).nullable().optional(),
  informed: z.boolean().nullable().optional(),
  comfortable: z.boolean().nullable().optional(),
  wellbeing_notes: z.string().max(500).nullable().optional(),
});

/** Bins del runner: alta (id del móvil) o cambio de estado */
export const BinPayloadSchema = z
  .object({
    action: z.enum(['register', 'status']),
    bin_id: z.string().uuid(),
    orchard_id: z.string().uuid().optional(),
    bin_code: z.string().min(1).max(100).optional(),
    status: z.enum(['empty', 'partial', 'full', 'collected']).optional(),
    filled_at: z.string().nullable().optional(),
  })
  .refine(p => p.action !== 'register' || (!!p.orchard_id && !!p.bin_code), {
    message: 'register needs orchard_id and bin_code',
  })
  .refine(p => p.action !== 'status' || !!p.status, { message: 'status change needs status' });

export const UnlinkPayloadSchema = z.object({
  userId: z.string(),
});
