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
  // Production Vercel domain
  if (origin === 'https://harvestpro.vercel.app') return true;
  // Vercel preview deployments (any branch)
  if (origin.endsWith('.vercel.app')) return true;
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

interface AuthResult {
  user: { id: string; email: string; role?: string };
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

  // Role check: consult public.users as the source of truth, not
  // `user.user_metadata`. JWT claims are frozen for the lifetime of
  // the token (default 3600s). An admin that demotes a manager via
  // manage-admin updates public.users.role synchronously, but the
  // target's JWT keeps the old `role` claim until they refresh —
  // checking metadata would let them keep calling manager-gated
  // Edge Functions during that window. A DB-backed check closes
  // that gap. Uses the service_role key (bypasses RLS) so the
  // lookup cannot itself be foiled by a stale policy cache.
  const adminUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!adminUrl || !serviceKey) {
    throw new AuthError('Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY', 500);
  }
  const adminClient = createClient(adminUrl, serviceKey);
  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new AuthError(`Role lookup failed: ${profileError.message}`, 500);
  }
  if (!profile) {
    throw new AuthError('No user profile found — contact support', 403);
  }
  if (profile.is_active === false) {
    throw new AuthError('Account is deactivated', 403);
  }
  const userRole = profile.role as string | undefined;
  if (!userRole || !roles.includes(userRole as AllowedRole)) {
    throw new AuthError(
      `Insufficient permissions. Required: ${roles.join('|')}. Got: ${userRole || 'none'}`,
      403
    );
  }

  return {
    user: { id: user.id, email: user.email ?? '', role: userRole },
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
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
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
  verified_by: z.string().uuid().optional(),
});

export const AttendanceCheckOutSchema = z.object({
  action: z.literal('check_out'),
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
});

export const AttendanceCorrectionSchema = z.object({
  action: z.literal('correct'),
  attendance_id: z.string().uuid('attendance_id must be a valid UUID'),
  check_in: z.string().datetime().optional(),
  check_out: z.string().datetime().optional(),
  reason: z.string().min(5, 'Correction reason must be at least 5 characters'),
  admin_id: z.string().uuid('admin_id must be a valid UUID'),
});

export const AttendanceInputSchema = z.discriminatedUnion('action', [
  AttendanceCheckInSchema,
  AttendanceCheckOutSchema,
  AttendanceCorrectionSchema,
]);

// Bucket Recording
export const BucketRecordSchema = z.object({
  picker_id: z.string().min(1, 'picker_id is required'),
  orchard_id: z.string().uuid('orchard_id must be a valid UUID'),
  row_number: z.number().int().positive().optional(),
  quality_grade: z.string().optional(),
  bin_id: z.string().optional(),
  scanned_by: z.string().uuid('scanned_by must be a valid UUID'),
  scanned_at: z.string().optional(),
});

// Admin User Management
export const AdminUpdateRoleSchema = z.object({
  action: z.literal('update_role'),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  new_role: z.enum(['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics'], {
    errorMap: () => ({ message: 'Role must be admin, manager, team_leader, runner, qc_inspector, payroll_admin, hr_admin, or logistics' }),
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
  verified_by: z.string().uuid('verified_by must be a valid UUID'),
  current_updated_at: z.string().optional(),
});

// Audit Log Submission
export const AuditLogEntrySchema = z.object({
  event_type: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  action: z.string().min(1),
  user_id: z.string().uuid().optional(),
  user_email: z.string().email().optional(),
  orchard_id: z.string().uuid().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  details: z.record(z.unknown()).optional(),
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
