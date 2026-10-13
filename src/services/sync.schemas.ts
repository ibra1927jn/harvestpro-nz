/**
 * Esquemas Zod de los payloads de la cola de sincronización.
 * Módulo aparte para que sync.service lo cargue con import() al procesar la cola:
 * así zod no va en el bundle inicial (login / runner).
 */
import { z } from 'zod';

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

export const QCInspectionPayloadSchema = z.object({
  orchard_id: z.string(),
  picker_id: z.string(),
  inspector_id: z.string(),
  grade: z.enum(['A', 'B', 'C', 'reject']),
  notes: z.string().nullable().optional(),
  photo_url: z.string().nullable().optional(),
});

export const UnlinkPayloadSchema = z.object({
  userId: z.string(),
});
