import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
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
 * Security: any active user can submit logs (for their own actions)
 */
serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth (cualquier rol, cuenta activa) ──────
        // requireRole lee rol y estado de public.users: una cuenta desactivada
        // ya no puede escribir en la auditoría (antes bastaba un JWT válido).
        const { user, supabase } = await requireRole(req, [
            'admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics',
        ])

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
            // action: CHECK INSERT/UPDATE/DELETE/CUSTOM → el evento va en new_values.event
            action: ['INSERT', 'UPDATE', 'DELETE'].includes(entry.action) ? entry.action : 'CUSTOM',
            table_name: entry.entity_type || entry.event_type || 'app',
            record_id: entry.entity_id && UUID_RE.test(entry.entity_id) ? entry.entity_id : null,
            // Siempre quien envía: la BD rechaza entradas en nombre de otro
            user_id: user.id,
            user_email: user.email,
            new_values: {
                event: entry.action,
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
