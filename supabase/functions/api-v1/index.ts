/**
 * HarvestPro NZ — Public REST API (v1)
 *
 * Supabase Edge Function providing authenticated API access
 * for third-party integrations (Xero, Figured, MYOB, irrigation systems).
 *
 * Authentication: Bearer token using API keys from api_keys table.
 * Rate limiting: 100 requests/minute per key.
 *
 * Routes:
 *   GET  /orchards              — List accessible orchards
 *   GET  /orchards/:id/harvest  — Today's harvest data
 *   GET  /orchards/:id/payroll  — Payroll summary
 *   GET  /orchards/:id/attendance — Attendance records
 *   GET  /orchards/:id/bins     — Bin inventory
 *   POST /orchards/:id/export/mpi — Generate MPI export
 *
 * @module supabase/functions/api-v1
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/security.ts';

// Metodos HTTP permitidos por este endpoint
const ALLOWED_METHODS = 'GET, POST, OPTIONS';

// =============================================
// AUTH: Validate API key
// =============================================
async function validateAPIKey(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<{ valid: boolean; orchardId?: string; scopes?: string[]; rateLimited?: boolean }> {
  if (!authHeader?.startsWith('Bearer hpnz_')) {
    return { valid: false };
  }

  const key = authHeader.replace('Bearer ', '');

  // Hash the provided key and look it up
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, orchard_id, scopes, expires_at, is_active, request_count, last_used_at')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (!apiKey) return { valid: false };

  // Check expiration
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { valid: false };
  }

  // AUDIT S-4: DB-backed rate limiting (100 req/min)
  // Reset count if last request was > 1 minute ago
  const lastUsed = apiKey.last_used_at ? new Date(apiKey.last_used_at) : null;
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const currentCount = lastUsed && lastUsed > oneMinuteAgo ? apiKey.request_count || 0 : 0;

  if (currentCount >= 100) {
    return { valid: false, rateLimited: true };
  }

  // Update last_used_at and request_count
  await supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      request_count: currentCount + 1,
    })
    .eq('id', apiKey.id);

  return {
    valid: true,
    orchardId: apiKey.orchard_id,
    scopes: apiKey.scopes,
  };
}

// =============================================
// ROUTE HANDLERS
// =============================================

async function handleGetHarvest(supabase: ReturnType<typeof createClient>, orchardId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('bucket_records')
    .select('id, picker_id, scanned_at, quality_grade, row_number, bin_id')
    .eq('orchard_id', orchardId)
    .gte('scanned_at', today.toISOString())
    .order('scanned_at', { ascending: false });

  if (error) return { error: error.message, status: 500 };

  return {
    data: {
      date: today.toISOString().split('T')[0],
      total_buckets: data?.length || 0,
      records: data || [],
    },
    status: 200,
  };
}

async function handleGetAttendance(supabase: ReturnType<typeof createClient>, orchardId: string) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_attendance')
    .select('picker_id, date, check_in, check_out')
    .eq('orchard_id', orchardId)
    .eq('date', today);

  if (error) return { error: error.message, status: 500 };

  return {
    data: {
      date: today,
      // Personas fichadas hoy (una persona puede tener varios tramos)
      total_checked_in: new Set(((data || []) as { picker_id: string; check_in: string | null }[]).filter(a => a.check_in).map(a => a.picker_id)).size,
      records: data || [],
    },
    status: 200,
  };
}

async function handleGetPayroll(supabase: ReturnType<typeof createClient>, orchardId: string) {
  const { data: settings } = await supabase
    .from('harvest_settings')
    .select('piece_rate')
    .eq('orchard_id', orchardId)
    .single();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: buckets } = await supabase
    .from('bucket_records')
    .select('picker_id')
    .eq('orchard_id', orchardId)
    .gte('scanned_at', today.toISOString());

  // Aggregate by picker
  const pickerCounts = new Map<string, number>();
  for (const b of buckets || []) {
    pickerCounts.set(b.picker_id, (pickerCounts.get(b.picker_id) || 0) + 1);
  }

  const pieceRate = settings?.piece_rate || 0;
  const summary = Array.from(pickerCounts.entries()).map(([pickerId, count]) => ({
    picker_id: pickerId,
    bucket_count: count,
    gross_pay: count * pieceRate,
    piece_rate: pieceRate,
  }));

  return {
    data: {
      date: today.toISOString().split('T')[0],
      piece_rate: pieceRate,
      total_pickers: summary.length,
      total_buckets: buckets?.length || 0,
      total_gross: summary.reduce((sum, s) => sum + s.gross_pay, 0),
      pickers: summary,
    },
    status: 200,
  };
}

// =============================================
// MAIN HANDLER
// =============================================

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = {
    ...corsHeaders(origin),
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // Service-role client: api-v1 autentica via API key (no JWT de usuario),
  // por lo que auth.uid() es NULL y las RLS policies bloquean todo.
  // Seguridad defense-in-depth:
  //   1. API key validada y hasheada contra api_keys table
  //   2. orchardId extraído de la key (no del request) — no se puede falsificar
  //   3. Cada query filtra explícitamente por auth.orchardId — aislamiento de tenant
  //   4. Rate limiting DB-backed (100 req/min por key)
  //   5. CORS allowlist activo
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Validar API key
  const auth = await validateAPIKey(supabase, req.headers.get('Authorization'));
  if (!auth.valid) {
    if (auth.rateLimited) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded — 100 requests/minute' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }
    return new Response(JSON.stringify({ error: 'Invalid or expired API key' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Validacion explicita de tenant: verificar que orchardId existe en la BD
  const { data: orchardCheck, error: orchardCheckError } = await supabase
    .from('orchards')
    .select('id')
    .eq('id', auth.orchardId!)
    .maybeSingle();

  if (orchardCheckError || !orchardCheck) {
    return new Response(JSON.stringify({ error: 'API key references invalid tenant' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api-v1', '');

  let result: { data?: unknown; error?: string; status: number };

  // Enrutamiento — todas las queries usan auth.orchardId para aislamiento de tenant
  if (path === '/orchards' && req.method === 'GET') {
    const { data } = await supabase
      .from('orchards')
      .select('id, name, total_rows, crop_type')
      .eq('id', auth.orchardId!);
    result = { data, status: 200 };
  } else if (path.match(/^\/orchards\/[^/]+\/harvest$/) && req.method === 'GET') {
    result = await handleGetHarvest(supabase, auth.orchardId!);
  } else if (path.match(/^\/orchards\/[^/]+\/attendance$/) && req.method === 'GET') {
    result = await handleGetAttendance(supabase, auth.orchardId!);
  } else if (path.match(/^\/orchards\/[^/]+\/payroll$/) && req.method === 'GET') {
    if (!auth.scopes?.includes('payroll:read')) {
      result = { error: 'Insufficient scope: payroll:read required', status: 403 };
    } else {
      result = await handleGetPayroll(supabase, auth.orchardId!);
    }
  } else {
    result = { error: `Route not found: ${req.method} ${path}`, status: 404 };
  }

  return new Response(JSON.stringify(result.error ? { error: result.error } : result.data), {
    status: result.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
