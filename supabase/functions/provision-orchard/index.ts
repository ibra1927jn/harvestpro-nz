// provision-orchard/index.ts — Customer Onboarding Edge Function
// Creates a new orchard account with all required defaults in one atomic operation.
// Called from the public signup flow — no existing auth required.

import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/security.ts';
import { z } from 'npm:zod@^4.3.6';

// Esquema de validacion con Zod para el request de provision
const ProvisionRequestSchema = z.object({
  orchard_name: z.string().min(1, 'orchard_name is required').trim(),
  orchard_address: z.string().trim().optional(),
  total_rows: z.number().int().positive().optional(),
  admin_email: z.string().email('Valid admin_email is required'),
  admin_password: z.string().min(8, 'admin_password must be at least 8 characters'),
  admin_name: z.string().min(1, 'admin_name is required').trim(),
  accepted_terms: z.literal(true, { error: 'You must accept the Terms of Service' }),
  accepted_privacy: z.literal(true, { error: 'You must accept the Privacy Policy' }),
  terms_version: z.string().min(1),
  privacy_version: z.string().min(1),
});

// Simple in-memory rate limiter (5 signups per IP per hour)
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('Origin');
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const clientIp = req.headers.get('x-forwarded-for') ?? 'unknown';

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many signup attempts. Please try again in 1 hour.' }),
      { status: 429, headers }
    );
  }

  // ── Service role client ───────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return err(500, 'Server is not configured', headers);
  }

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const rawBody = await req.json();

    // ── Validacion con Zod ────────────────────────────────────────────────
    const parseResult = ProvisionRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      // zod 4: la lista de fallos está en .issues (antes .errors → undefined → 500)
      const firstError = parseResult.error.issues[0]?.message ?? 'Invalid input';
      return err(400, firstError, headers);
    }
    const body = parseResult.data;

    // ── Una instalación por empresa ───────────────────────────────────────
    // El registro solo crea la PRIMERA empresa de esta instalación. Si ya hay
    // huertos, las cuentas nuevas las da el admin desde la app.
    const { count: existing, error: countError } = await supabase
      .from('orchards')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (countError) return err(500, 'Could not check this installation. Please try again.', headers);
    if ((existing ?? 0) > 0) {
      return err(403, 'This HarvestPro installation is already set up. Ask your administrator for an account.', headers);
    }

    // ── Paso 1: usuario admin ─────────────────────────────────────────────
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.admin_email,
      password: body.admin_password,
      email_confirm: true,
      user_metadata: {
        name: body.admin_name,
        role: 'admin',
        onboarding_source: 'self-signup',
        accepted_terms_at: new Date().toISOString(),
        terms_version: body.terms_version,
        privacy_version: body.privacy_version,
      },
    });

    if (authError) {
      if (authError.message.includes('already registered'))
        return err(409, 'An account with this email already exists. Please log in.', headers);
      return err(400, `Account creation failed: ${authError.message}`, headers);
    }

    const userId = authData.user.id;
    const rollback = async (orchardId?: string) => {
      if (orchardId) {
        await supabase.from('harvest_settings').delete().eq('orchard_id', orchardId);
        await supabase.from('users').delete().eq('id', userId);
        await supabase.from('orchards').delete().eq('id', orchardId);
      }
      await supabase.auth.admin.deleteUser(userId);
    };

    // ── Paso 2: huerto (columnas reales: location, no address/created_by) ─
    const { data: orchard, error: orchardError } = await supabase
      .from('orchards')
      .insert({
        name: body.orchard_name,
        location: body.orchard_address || null,
        total_rows: body.total_rows || 20,
      })
      .select('id, name')
      .single();

    if (orchardError) {
      await rollback();
      return err(500, `Failed to create orchard: ${orchardError.message}`, headers);
    }
    const orchardId = orchard.id;

    // ── Paso 3: perfil del admin (sin él, la app no le deja ver nada) ─────
    const { error: profileError } = await supabase.from('users').insert({
      id: userId,
      email: body.admin_email,
      full_name: body.admin_name,
      role: 'admin',
      orchard_id: orchardId,
      is_active: true,
      privacy_consent_at: new Date().toISOString(),
    });
    if (profileError) {
      console.error('[provision-orchard] users insert failed:', profileError);
      await rollback(orchardId);
      return err(500, 'Failed to create the admin profile. Please try again.', headers);
    }

    // ── Paso 4: configuración de pago del huerto ──────────────────────────
    const { error: settingsError } = await supabase.from('harvest_settings').insert({
      orchard_id: orchardId,
      piece_rate: 6.5,
      min_wage_rate: 23.95,
    });
    if (settingsError) {
      console.error('[provision-orchard] harvest_settings insert failed:', settingsError);
      await rollback(orchardId);
      return err(500, 'Failed to create orchard settings. Please try again.', headers);
    }

    // ── Paso 5: registro de auditoría (no crítico) ────────────────────────
    await supabase.from('audit_logs').insert({
      action: 'orchard_provisioned',
      table_name: 'orchards',
      record_id: orchardId,
      user_id: userId,
      new_values: { orchard_name: body.orchard_name, source: 'self-signup' },
    });

    return new Response(
      JSON.stringify({
        success: true,
        orchardId,
        orchardName: orchard.name,
        userId,
        message: 'Account created successfully. You can now log in.',
      }),
      { status: 201, headers }
    );

  } catch (e) {
    console.error('[provision-orchard] Unexpected error:', e);
    return err(500, 'An unexpected error occurred. Please try again.', headers);
  }
});

function err(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}
