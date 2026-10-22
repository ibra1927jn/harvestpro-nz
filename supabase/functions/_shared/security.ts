/**
 * _shared/security.ts — Reusable security helpers for Supabase Edge Functions
 *
 * Provides: CORS, auth verification, role-based access control, input validation,
 * rate limiting, and error sanitization.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@^4.3.6';

// ── CORS ─────────────────────────────────────────────

/** Production and preview origins allowed to call Edge Functions */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  // Production custom domain
  if (origin === 'https://app.harvestpro.nz') return true;
  // Local development
  if (origin === 'http://localhost:5173') return true;
  if (origin === 'http://localhost:3000') return true;
  return false;
}

/**
 * Build CORS headers dynamically based on the request's Origin.
 * If the origin is allowed, reflect it back (not '*').
 * If not allowed, omit Access-Control-Allow-Origin to trigger browser CORS block.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
    headers['Vary'] = 'Origin';
  }

  return headers;
}

/**
 * Handle OPTIONS preflight. Must be called at the top of every Edge Function.
 * Returns a Response if it's a preflight, or null if the request should continue.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(req.headers.get('Origin')),
    });
  }
  return null;
}

// ── Rate Limiting ────────────────────────────────────

/**
 * In-memory rate limiter using sliding window counters.
 * Resets on function cold-start (acceptable for Edge Functions).
 *
 * LIMITATION (Audit M-1): This rate limiter is ephemeral — it resets
 * on each cold start of the Edge Function. For production-grade rate
 * limiting that persists across invocations, migrate to:
 * - Upstash Redis (recommended for Edge Functions)
 * - PostgreSQL-based sliding window table
 * Current implementation provides per-warm-instance protection only.
 */
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

export interface RateLimitOptions {
  maxRequests: number; // max requests per window
  windowMs: number; // window duration in ms
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxRequests: 60,
  windowMs: 60_000, // 1 minute
};

/**
 * Check rate limit for a given key (typically user ID or IP).
 * Throws AuthError(429) if limit exceeded.
 */
export function checkRateLimit(key: string, options: RateLimitOptions = DEFAULT_RATE_LIMIT): void {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > options.windowMs) {
    // New window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > options.maxRequests) {
    throw new AuthError(
      `Rate limit exceeded. Max ${options.maxRequests} requests per ${options.windowMs / 1000}s.`,
      429
    );
  }
}

// ── Auth & RBAC ──────────────────────────────────────

/** Allowed roles that can invoke management Edge Functions */
type AllowedRole = 'admin' | 'manager' | 'team_leader' | 'runner' | 'qc_inspector' | 'payroll_admin' | 'hr_admin' | 'logistics';

/** Roles que necesitan 2FA (aal2); misma lista que MFAGuard y public.mfa_satisfied() */
const MFA_ROLES: ReadonlySet<string> = new Set(['admin', 'manager', 'payroll_admin', 'hr_admin']);

interface AuthResult {
  user: { id: string; email: string };
  supabase: SupabaseClient;
}

/**
 * Verify the request has a valid JWT and the user has one of the allowed roles.
 * Creates a Supabase client scoped to the user's session.
 *
 * @throws Error with appropriate HTTP status context if auth fails
 */
export async function requireRole(
  req: Request,
  roles: AllowedRole[] = ['admin', 'manager']
): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing authorization header', 401);
  }

  // Create Supabase client with the user's JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  // Verify the JWT is valid and get the user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  // Rol y estado desde public.users (la fila propia es legible por RLS).
  // NUNCA desde user_metadata: el usuario la cambia con auth.updateUser().
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    throw new Error(`Role lookup failed: ${profileError.message}`);
  }
  if (!profile || profile.is_active !== true) {
    throw new AuthError('Account is not active', 403);
  }
  const userRole = profile.role as string | undefined;
  if (!userRole || !roles.includes(userRole as AllowedRole)) {
    throw new AuthError(
      `Insufficient permissions. Required: ${roles.join('|')}. Got: ${userRole || 'none'}`,
      403
    );
  }

  // 2FA en el servidor: un rol privilegiado necesita sesión aal2 (salvo que
  // security_settings.enforce_mfa esté apagado, solo en el PC de desarrollo).
  // Lo decide la BD con el mismo token (mfa_satisfied), igual que el RLS.
  if (MFA_ROLES.has(userRole)) {
    const { data: satisfied, error: mfaError } = await supabase.rpc('mfa_satisfied');
    if (mfaError) {
      throw new Error(`2FA check failed: ${mfaError.message}`);
    }
    if (satisfied !== true) {
      throw new AuthError('Two-factor authentication required: verify your 2FA code and try again', 403);
    }
  }

  return {
    user: { id: user.id, email: user.email ?? '' },
    supabase,
  };
}

// ── Custom Error ─────────────────────────────────────

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

// ── Error Sanitization ───────────────────────────────

/**
 * Build a safe error response. Never leaks stack traces.
 * Logs the full error server-side for debugging.
 */
export function errorResponse(error: unknown, origin: string | null, context: string): Response {
  const isAuthError = error instanceof AuthError;

  // Log full error server-side (visible in Supabase dashboard logs)
  console.error(`[${context}] Error:`, error);

  const status = isAuthError ? error.status : 400;
  const message = error instanceof Error ? error.message : 'Unknown error';

  return new Response(
    JSON.stringify({
      error: isAuthError ? message : 'Request failed. Check parameters and try again.',
      ...(isAuthError ? {} : { hint: message }),
    }),
    {
      status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json',
      },
    }
  );
}

// ── Shared JSON Response Helper ──────────────────────

export function jsonResponse(data: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

// ── Input Validation Schemas ─────────────────────────

// Payroll
export const PayrollInputSchema = z.object({
  // Sin orchard_id = nómina de la empresa (todos los huertos, suma por persona)
  orchard_id: z.string().uuid('orchard_id must be a valid UUID').optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD'),
});

// Anomaly Detection
export const AnomalyInputSchema = z.object({
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
});

// Attendance Management
export const AttendanceCheckInSchema = z.object({
  action: z.literal('check_in'),
  picker_id: z.string().uuid('picker_id must be a valid UUID'),
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
  // Se ignora: quien verifica el fichaje es siempre quien llama (clientes antiguos lo mandan)
  verified_by: z.string().optional(),
});

export const AttendanceCheckOutSchema = z.object({
  action: z.literal('check_out'),
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
});

export const AttendanceCorrectionSchema = z.object({
  action: z.literal('correct'),
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
  // Con zona horaria (+12:00/+13:00 en NZ) o en UTC. Antes solo UTC: el editor
  // mandaba "+13:00" y todas las correcciones se rechazaban.
  check_in: z.string().datetime({ offset: true }).optional(),
  check_out: z.string().datetime({ offset: true }).optional(),
  // Hora del descanso de 30 min (no pagado) que anota el team leader; null = quitarla
  break_start: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().min(5, 'Correction reason must be at least 5 characters'),
  // Se ignora: quien corrige es siempre quien llama (antes se guardaba este id)
  admin_id: z.string().optional(),
});

// Un fichaje dentro de un lote de correcciones: cada campo es opcional
// (vacío = no tocar); break_start null = quitar el descanso anotado
export const AttendanceBatchItemSchema = z.object({
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
  check_in: z.string().datetime({ offset: true }).optional(),
  check_out: z.string().datetime({ offset: true }).optional(),
  break_start: z.string().datetime({ offset: true }).nullable().optional(),
});

/** Máximo de fichajes por lote (un día de un huerto grande cabe de sobra) */
export const ATTENDANCE_BATCH_MAX = 200;

export const AttendanceBatchCorrectionSchema = z.object({
  action: z.literal('correct_batch'),
  items: z.array(AttendanceBatchItemSchema)
    .min(1, 'At least one item is required')
    .max(ATTENDANCE_BATCH_MAX, `At most ${ATTENDANCE_BATCH_MAX} items per batch`),
  // Un solo motivo para todo el lote (va a la auditoría de cada fichaje);
  // mismo mínimo que `correct`, con tope para no inflar N filas de auditoría
  reason: z.string()
    .min(5, 'Correction reason must be at least 5 characters')
    .max(500, 'Correction reason must be at most 500 characters'),
  // Se ignora: quien corrige es siempre quien llama
  admin_id: z.string().optional(),
});

export const AttendanceInputSchema = z.discriminatedUnion('action', [
  AttendanceCheckInSchema,
  AttendanceCheckOutSchema,
  AttendanceCorrectionSchema,
  AttendanceBatchCorrectionSchema,
]);

// Bucket Recording
export const BucketRecordSchema = z.object({
  picker_id: z.string().min(1, 'picker_id is required'),
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
  row_number: z.number().int().positive().optional(),
  quality_grade: z.string().optional(),
  bin_id: z.string().optional(),
  scanned_by: z.string().uuid('scanned_by must be a valid UUID').optional(),
  scanned_at: z.string().optional(),
});

// Admin User Management
export const AdminUpdateRoleSchema = z.object({
  action: z.literal('update_role'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  new_role: z.enum(['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics'], {
    // Zod 4: `error` (el `errorMap` de Zod 3 se ignoraba y salía el mensaje genérico)
    error: 'Role must be admin, manager, team_leader, runner, qc_inspector, payroll_admin, hr_admin, or logistics',
  }),
});

export const AdminDeactivateSchema = z.object({
  action: z.literal('deactivate'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
});

export const AdminReactivateSchema = z.object({
  action: z.literal('reactivate'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
});

export const AdminInputSchema = z.discriminatedUnion('action', [
  AdminUpdateRoleSchema,
  AdminDeactivateSchema,
  AdminReactivateSchema,
]);

// Compliance Check
export const ComplianceCheckSchema = z.object({
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
  picker_ids: z.array(z.string().uuid()).min(1, 'At least one picker_id required').max(100),
});

// Timesheet Approval
export const TimesheetApprovalSchema = z.object({
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
  // Aprobar (por defecto) o rechazar; el motivo solo cuenta al rechazar
  decision: z.enum(['approve', 'reject']).default('approve'),
  reason: z.string().trim().max(500).optional(),
  // Se ignora: quien aprueba es siempre quien llama. La pantalla de Nómina
  // manda 'current_user' (no es un UUID) y antes toda aprobación daba 400.
  verified_by: z.string().optional(),
  current_updated_at: z.string().optional(),
}).superRefine((v, ctx) => {
  // Rechazar vuelve la hoja a quien la corrige: sin motivo no sabe qué cambiar (B10)
  if (v.decision === 'reject' && (!v.reason || v.reason.length < 3 || v.reason.length > 200)) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A rejection needs a reason of 3 to 200 characters' });
  }
});

// Audit Log Submission
/** Aprobación en lote (Nómina, «Aprobar todas»): hasta 500 hojas por llamada */
export const TimesheetBatchApprovalSchema = z.object({
  items: z.array(z.object({
    attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
    current_updated_at: z.string().optional(),
  })).min(1).max(500),
});

export const AuditLogEntrySchema = z.object({
  event_type: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  action: z.string().min(1),
  user_id: z.string().uuid().optional(),
  user_email: z.string().email().optional(),
  orchard_id: z.string().uuid().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string().optional(),
});

export const AuditLogBatchSchema = z.object({
  entries: z.array(AuditLogEntrySchema).min(1).max(100),
});

// Re-export types
export type PayrollInput = z.infer<typeof PayrollInputSchema>;
export type AnomalyInput = z.infer<typeof AnomalyInputSchema>;
export type AttendanceInput = z.infer<typeof AttendanceInputSchema>;
export type BucketRecordInput = z.infer<typeof BucketRecordSchema>;
export type AdminInput = z.infer<typeof AdminInputSchema>;
export type ComplianceCheckInput = z.infer<typeof ComplianceCheckSchema>;
export type TimesheetApprovalInput = z.infer<typeof TimesheetApprovalSchema>;
export type AuditLogBatchInput = z.infer<typeof AuditLogBatchSchema>;
