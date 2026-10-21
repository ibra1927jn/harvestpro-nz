/**
 * schemas.ts — Zod boundary schemas
 * 
 * Runtime validation for data entering the app from external sources:
 * - Supabase responses (pickers, attendance, payroll)
 * - QR scanner input
 * - Settings forms (financial rates)
 * 
 * Strategy: validate ONLY at boundaries. Internal React state is already
 * type-checked by TypeScript strict mode.
 */
import { z } from 'zod';
import { logger } from '@/utils/logger';

// ─── QR Scanner Input ───────────────────────────
// The QR code may contain garbage from damaged labels, sun-bleached stickers,
// or partial reads. This schema ensures only valid IDs enter the bucket ledger.

export const QRPayloadSchema = z.object({
    picker_id: z.string()
        .min(1, 'Picker ID cannot be empty')
        .max(100, 'Picker ID too long — likely a scan error'),
    orchard_id: z.string().uuid('Invalid orchard ID format').optional(),
    row_number: z.number().int().min(0).max(9999).optional(),
    quality_grade: z.enum(['A', 'B', 'C', 'reject']).default('A'),
    bin_id: z.string().optional(),
    scanned_by: z.string().uuid().optional(),
    scanned_at: z.string().optional(),
});

export type QRPayload = z.infer<typeof QRPayloadSchema>;

// ─── Supabase: Picker ───────────────────────────
// Pickers come from Supabase with potentially null/undefined fields.
// This coerces and validates the shape before it hits React components.

export const PickerSchema = z.object({
    id: z.string().min(1, 'Picker ID required'),
    picker_id: z.string().default(''),
    name: z.string().min(1, 'Picker name required'),
    status: z.enum(['active', 'break', 'on_break', 'issue', 'inactive', 'suspended', 'archived'])
        .default('inactive'),
    safety_verified: z.boolean().default(false),
    current_row: z.number().default(0),
    orchard_id: z.string().nullable().optional(),
    team_leader_id: z.string().nullable().optional(),
    role: z.string().optional(),
    archived_at: z.string().nullable().optional(),
    harness_number: z.string().nullable().optional(),
});

export type ValidatedPicker = z.infer<typeof PickerSchema>;

// ─── Supabase: Attendance Record ────────────────
// LAW-1 FIX: Added 'sick' and 'left_early' to match DB union type.
// LAW-2 FIX: Removed hours_worked — column doesn't exist in daily_attendance.
//            Hours are calculated as check_out - check_in.

export const AttendanceRecordSchema = z.object({
    id: z.string().uuid(),
    picker_id: z.string().uuid(),
    orchard_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    check_in: z.string().nullable().optional(),
    check_out: z.string().nullable().optional(),
    // hours_worked: REMOVED — column does not exist in daily_attendance (CRIT-1 fix)
    status: z.enum(['present', 'absent', 'late', 'sick', 'left_early']).default('present'),
    verified_by: z.string().uuid().nullable().optional(),
});

export type ValidatedAttendance = z.infer<typeof AttendanceRecordSchema>;

// ─── Financial: Harvest Settings ────────────────
// These values directly affect payroll calculations.
// A corrupted piece_rate = wrong pay for every picker.

export const HarvestSettingsSchema = z.object({
    min_wage_rate: z.number()
        .min(0, 'Wage rate cannot be negative')
        .max(500, 'Wage rate seems unreasonably high'),
    piece_rate: z.number()
        .min(0, 'Piece rate cannot be negative')
        .max(100, 'Piece rate seems unreasonably high'),
    min_buckets_per_hour: z.number()
        .int()
        .min(0)
        .max(200),
    target_tons: z.number()
        .min(0)
        .max(10000),
    variety: z.string().optional(),
});

export type ValidatedSettings = z.infer<typeof HarvestSettingsSchema>;

// ─── QC: inspección de un picker ────────────────
// Lo que escribe la pantalla de Calidad (y lo que reintenta la cola offline)
// antes de llegar a qc_inspections. Los criterios son opcionales: una
// inspección solo con nota (formato anterior) sigue siendo válida.

export const QcCriterionStateSchema = z.enum(['ok', 'warn', 'bad']);

export const QcCriteriaSchema = z.object({
    ladder: QcCriterionStateSchema.optional(),
    tree_damage: QcCriterionStateSchema.optional(),
    fruit_on_ground: QcCriterionStateSchema.optional(),
    bucket_fill: QcCriterionStateSchema.optional(),
    size: QcCriterionStateSchema.optional(),
    damaged_fruit: QcCriterionStateSchema.optional(),
});

export const QcInspectionInsertSchema = z.object({
    orchard_id: z.string().min(1),
    picker_id: z.string().min(1),
    inspector_id: z.string().min(1),
    grade: z.enum(['A', 'B', 'C', 'reject']),
    notes: z.string().max(2000).nullable().optional(),
    photo_url: z.string().max(1000).nullable().optional(),
    criteria: QcCriteriaSchema.nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    row_number: z.number().int().min(0).max(9999).nullable().optional(),
    informed: z.boolean().nullable().optional(),
    comfortable: z.boolean().nullable().optional(),
    wellbeing_notes: z.string().max(500).nullable().optional(),
});

export type ValidatedQcInspectionInsert = z.infer<typeof QcInspectionInsertSchema>;

// ─── RRHH: ausencias y permisos (leave_requests) ────
// Lo que escribe la Agenda de RRHH y lo que vuelve de la tabla.

export const LEAVE_TYPES = ['annual', 'sick', 'bereavement', 'family_violence', 'unpaid', 'day_off', 'other'] as const;
export const LEAVE_STATUSES = ['requested', 'approved', 'rejected', 'cancelled'] as const;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** Alta de una ausencia (formulario → insert) */
export const NewLeaveRequestSchema = z.object({
    orchard_id: z.string().uuid(),
    picker_id: z.string().uuid(),
    type: z.enum(LEAVE_TYPES),
    start_date: ymd,
    end_date: ymd,
    half_day: z.boolean().default(false),
    reason: z.string().trim().max(500).nullable().default(null),
    requested_by: z.string().uuid().nullable().default(null),
    status: z.enum(LEAVE_STATUSES).default('requested'),
}).refine(v => v.end_date >= v.start_date, { message: 'End date must be on or after the start date', path: ['end_date'] })
  .refine(v => !v.half_day || v.start_date === v.end_date, { message: 'A half day is a single day', path: ['half_day'] });

export type NewLeaveRequest = z.infer<typeof NewLeaveRequestSchema>;

/** Fila de leave_requests (lo que vuelve de la BD) */
export const LeaveRequestSchema = z.object({
    id: z.string().uuid(),
    orchard_id: z.string().uuid(),
    picker_id: z.string().uuid(),
    type: z.enum(LEAVE_TYPES),
    start_date: ymd,
    end_date: ymd,
    half_day: z.boolean().default(false),
    reason: z.string().nullable().default(null),
    status: z.enum(LEAVE_STATUSES),
    requested_by: z.string().uuid().nullable().default(null),
    decided_by: z.string().uuid().nullable().default(null),
    decided_at: z.string().nullable().default(null),
    decision_note: z.string().nullable().default(null),
    created_at: z.string(),
    updated_at: z.string(),
});

export type ValidatedLeaveRequest = z.infer<typeof LeaveRequestSchema>;

// ─── Utilities ──────────────────────────────────

/**
 * Safe parse that returns a Result-compatible shape.
 * Use at data boundaries instead of raw Zod parse.
 * 
 * @example
 * const result = safeParse(QRPayloadSchema, scannerData);
 * if (!result.success) {
 *     showToast(result.error, 'error');
 *     return;
 * }
 * // result.data is fully validated
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const messages = result.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
    return { success: false, error: messages };
}

/**
 * Parse an array of records, filtering out invalid ones and logging warnings.
 * Useful for Supabase responses where one bad record shouldn't crash the UI.
 */
export function safeParseArray<T>(schema: z.ZodSchema<T>, data: unknown[]): T[] {
    return data.reduce<T[]>((acc, item, index) => {
        const result = schema.safeParse(item);
        if (result.success) {
            acc.push(result.data);
        } else {
            logger.warn(`[Zod] Invalid record at index ${index}:`, result.error.issues);
        }
        return acc;
    }, []);
}
