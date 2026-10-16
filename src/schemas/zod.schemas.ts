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
