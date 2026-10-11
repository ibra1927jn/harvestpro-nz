/**
 * API Schemas — Zod runtime validation for external data boundaries
 *
 * These schemas validate data coming from:
 * - Supabase Edge Functions (payroll, attendance, etc.)
 * - Supabase DB queries (picker lists, settings)
 *
 * Why: TypeScript `as T` casts provide zero runtime safety.
 * A malformed Edge Function response will silently corrupt state.
 * Zod catches this at the boundary and provides actionable error messages.
 */
import { z } from 'zod';
import { logger } from '@/utils/logger';

// ── Payroll Boundaries ─────────────────────────────

export const PickerBreakdownSchema = z.object({
    picker_id: z.string().min(1),
    picker_name: z.string(),
    buckets: z.number().int().nonnegative(),
    hours_worked: z.number().nonnegative(),
    // Split holiday/ordinary añadido 2026-04-18 para Holidays Act 1.5x.
    // Optional — edge function versions anteriores no lo devolvían.
    hours_ordinary: z.number().nonnegative().optional(),
    hours_holiday: z.number().nonnegative().optional(),
    // Holidays Act 2003 s.60: día alternativo en lieu por cada public
    // holiday trabajado. Optional — edge function versions anteriores
    // no lo devolvían.
    alternative_holidays_owed: z.number().int().nonnegative().optional(),
    piece_rate_earnings: z.number().nonnegative(),
    hourly_rate: z.number().nonnegative(),
    minimum_required: z.number().nonnegative(),
    top_up_required: z.number().nonnegative(),
    total_earnings: z.number().nonnegative(),
    is_below_minimum: z.boolean(),
    // Días con horas estimadas (turno sin cerrar): revisar la hoja de horas
    // antes de pagar. Optional — versiones anteriores no lo devolvían.
    estimated_days: z.number().int().nonnegative().optional(),
    // Detalle día a día (tramos con huerto y horas, cubetas por variedad, pago).
    // Optional — versiones anteriores no lo devolvían.
    days: z.array(z.object({
        date: z.string(),
        segments: z.array(z.object({
            orchardId: z.string().nullable(),
            checkIn: z.string().nullable(),
            checkOut: z.string().nullable(),
            open: z.boolean(),
            breakStart: z.string().nullable(),
            grossHours: z.number(),
        })),
        hours: z.number(),
        breakMinutes: z.number(),
        buckets: z.number(),
        bucketsByVariety: z.record(z.string(), z.number()),
        pieceEarnings: z.number(),
        topUp: z.number(),
        total: z.number(),
        belowMinimum: z.boolean(),
        estimated: z.boolean(),
        isPublicHoliday: z.boolean(),
    })).optional(),
});

export const PayrollResultSchema = z.object({
    orchard_id: z.string().min(1),
    date_range: z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    summary: z.object({
        total_buckets: z.number().int().nonnegative(),
        total_hours: z.number().nonnegative(),
        total_piece_rate_earnings: z.number().nonnegative(),
        total_top_up: z.number().nonnegative(),
        total_earnings: z.number().nonnegative(),
        // Suma across pickers (Holidays Act s.60). Optional — edge
        // function versions anteriores no lo devolvían.
        total_alternative_holidays_owed: z.number().int().nonnegative().optional(),
        total_estimated_days: z.number().int().nonnegative().optional(),
    }),
    compliance: z.object({
        workers_below_minimum: z.number().int().nonnegative(),
        workers_total: z.number().int().nonnegative(),
        compliance_rate: z.number().min(0).max(100),
    }),
    picker_breakdown: z.array(PickerBreakdownSchema),
    settings: z.object({
        bucket_rate: z.number().positive(),
        min_wage_rate: z.number().positive(),
    }),
});

// ── Attendance Boundaries ──────────────────────────

export const CheckInResponseSchema = z.object({
    picker_id: z.string().min(1),
    status: z.string(),
    id: z.string().min(1),
    already_checked_in: z.boolean(),
    /** Tramo cerrado en otro huerto al fichar aquí */
    closed_shift_id: z.string().nullable().optional(),
});

export const CheckOutResponseSchema = z.object({
    id: z.string().min(1),
    picker_id: z.string().min(1),
    check_out: z.string(),
    hours_worked: z.number().nonnegative(),
});

// ── Picker Boundaries ──────────────────────────────
// LAW-2 FIX: Use canonical PickerSchema from zod.schemas — no more divergent duplicate.
// This schema is the single source of truth for picker shape validation.
export { PickerSchema } from '@/schemas/zod.schemas';
// Alias for API-boundary usage (explicit import path)
export { PickerSchema as ApiPickerSchema } from '@/schemas/zod.schemas';

// ── Compliance Boundaries ──────────────────────────

const ComplianceViolationSchema = z.object({
    type: z.enum(['break_overdue', 'wage_below_minimum', 'excessive_hours', 'hydration_reminder']),
    severity: z.enum(['low', 'medium', 'high']),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
});

const PickerComplianceSchema = z.object({
    picker_id: z.string(),
    picker_name: z.string(),
    is_compliant: z.boolean(),
    violations: z.array(ComplianceViolationSchema),
    metrics: z.object({
        hours_worked: z.number().nonnegative(),
        buckets_today: z.number().int().nonnegative(),
        effective_hourly_rate: z.number().nonnegative(),
        minimum_wage: z.number().positive(),
        is_below_minimum: z.boolean(),
        top_up_required: z.number().nonnegative(),
    }),
});

export const ComplianceResultSchema = z.object({
    orchard_id: z.string(),
    date: z.string(),
    pickers: z.array(PickerComplianceSchema),
    summary: z.object({
        total_checked: z.number().int().nonnegative(),
        compliant: z.number().int().nonnegative(),
        with_violations: z.number().int().nonnegative(),
        total_violations: z.number().int().nonnegative(),
    }),
});

// ── Anomaly Detection Boundaries ───────────────────

export const AnomalySchema = z.object({
    id: z.string(),
    type: z.enum(['impossible_velocity', 'peer_outlier', 'off_hours', 'duplicate_proximity', 'post_collection_spike']),
    severity: z.enum(['low', 'medium', 'high']),
    pickerId: z.string(),
    pickerName: z.string(),
    detail: z.string(),
    timestamp: z.string(),
    evidence: z.record(z.string(), z.unknown()),
    rule: z.enum(['elapsed_velocity', 'peer_comparison', 'off_hours', 'duplicate']),
});

export const AnomalyResponseSchema = z.object({
    anomalies: z.array(AnomalySchema),
    stats: z.object({
        total: z.number().int().nonnegative(),
        high: z.number().int().nonnegative().optional(),
        medium: z.number().int().nonnegative().optional(),
        low: z.number().int().nonnegative().optional(),
    }),
});

// ── Admin Boundaries ───────────────────────────────

export const AdminResponseSchema = z.object({
    success: z.boolean(),
    user_id: z.string().optional(),
    new_role: z.string().optional(),
    is_active: z.boolean().optional(),
});

// ── Push Notification Boundaries ───────────────────

export const PushResponseSchema = z.object({
    success: z.boolean(),
    sent: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    expired: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
});

// ── Audit Log Boundaries ───────────────────────────

export const AuditResponseSchema = z.object({
    success: z.boolean(),
    count: z.number().int().nonnegative().optional(),
});

// ── Safe Parse Helpers ─────────────────────────────

/**
 * Validate external data against a Zod schema.
 * On failure, logs the error and throws with a descriptive message.
 *
 * @example
 *   const data = await edgeFunctionsRepository.invoke('payroll', body);
 *   return validateResponse(PayrollResultSchema, data, 'calculatePayroll');
 */
export function validateResponse<T>(
    schema: z.ZodType<T>,
    data: unknown,
    operationName: string
): T {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    // Log detailed validation errors for debugging
    const issues = result.error.issues
        .map(i => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
    const errorMsg = `[Zod] ${operationName} response validation failed:\n${issues}`;
    logger.error(errorMsg);

    throw new Error(`Invalid ${operationName} response from server`);
}

/**
 * Validate external data with graceful fallback.
 * Returns the validated data or a default value if validation fails.
 * Useful for non-critical responses where a failure shouldn't crash the UI.
 */
export function validateResponseSafe<T>(
    schema: z.ZodType<T>,
    data: unknown,
    operationName: string,
    fallback: T
): T {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    const issues = result.error.issues
        .map(i => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
    logger.warn(`[Zod] ${operationName} validation warning (using fallback):\n${issues}`);

    return fallback;
}

