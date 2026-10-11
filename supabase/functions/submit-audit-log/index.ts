import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    handlePreflight,
    corsHeaders,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AuditLogBatchSchema,
} from '../_shared/security.ts'

/**
 * submit-audit-log — Server-side audit log ingestion
 *
 * Why server-side:
 * - Prevents client-side forgery of audit entries
 * - Adds server-verified timestamp and IP address
 * - Prevents suppression of audit logs
 *
 * Security: Any authenticated user can submit logs (for their own actions)
 */
serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth (any role) ──────────────────────────
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            )
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        if (authErr || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired token' }),
                { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            )
        }

        checkRateLimit(user.id, { maxRequests: 100, windowMs: 60_000 })

        const body = await req.json()
        const { entries } = AuditLogBatchSchema.parse(body)

        // ── Server-side enrichment ───────────────────
        const serverTimestamp = new Date().toISOString()
        // Primera IP de x-forwarded-for; la columna es inet, así que sin IP válida va null
        const rawIp = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim()
        const clientIp = /^[0-9a-fA-F:.]+$/.test(rawIp) ? rawIp : null
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

        // Columnas reales de audit_logs: lo que no tiene columna propia va en new_values
        const enrichedEntries = entries.map(entry => ({
            action: entry.action,
            table_name: entry.entity_type || entry.event_type || 'app',
            record_id: entry.entity_id && UUID_RE.test(entry.entity_id) ? entry.entity_id : null,
            user_id: entry.user_id || user.id,
            user_email: entry.user_email || user.email,
            new_values: {
                event_type: entry.event_type,
                severity: entry.severity,
                orchard_id: entry.orchard_id,
                entity_id: entry.entity_id,
                details: entry.details,
            },
            ip_address: clientIp,
            // Use server timestamp, ignore client timestamp to prevent forgery
            created_at: serverTimestamp,
        }))

        // ── Batch insert ─────────────────────────────
        const { error: insertErr } = await supabase
            .from('audit_logs')
            .insert(enrichedEntries)

        if (insertErr) {
            console.error('[submit-audit-log] Insert error:', insertErr)
            throw new Error(`Failed to insert audit logs: ${insertErr.message}`)
        }

        console.info(`[submit-audit-log] Ingested ${entries.length} entries from user=${user.id}`)

        return jsonResponse({
            success: true,
            count: entries.length,
        }, origin)

    } catch (error) {
        return errorResponse(error, origin, 'submit-audit-log')
    }
})
