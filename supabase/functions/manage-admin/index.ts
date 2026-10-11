import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AdminInputSchema,
} from '../_shared/security.ts'
import { writeAudit } from '../_shared/audit.ts'

/**
 * manage-admin — Server-side admin user management
 *
 * Actions:
 * - update_role:  Change a user's role
 * - deactivate:   Soft-delete a user
 * - reactivate:   Restore a user
 *
 * Security: OWNER ONLY — prevents privilege escalation
 */
serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin'])
        checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 }) // Lower limit for admin ops

        const body = await req.json()
        const input = AdminInputSchema.parse(body)

        // Prevent self-modification
        if (input.user_id === user.id) {
            throw new Error('Cannot modify your own account via this endpoint')
        }

        // ── UPDATE ROLE ──────────────────────────────
        if (input.action === 'update_role') {
            const { user_id, new_role } = input

            const { error: updateErr } = await supabase
                .from('users')
                .update({
                    role: new_role,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user_id)

            if (updateErr) throw new Error(`Failed to update role: ${updateErr.message}`)

            // Audit trail
            const { error: auditErr_user_role_changed } = await writeAudit(supabase, {
                action: 'user_role_changed',
                table: 'users',
                recordId: user_id,
                userId: user.id,
                newValues: { role: new_role },
            })
            if (auditErr_user_role_changed) console.error(`[manage-admin] Audit failed: ${auditErr_user_role_changed.message}`)

            console.info(`[manage-admin] Role updated: user=${user_id}, role=${new_role}, by=${user.id}`)

            return jsonResponse({ success: true, user_id, new_role }, origin)
        }

        // ── DEACTIVATE ───────────────────────────────
        if (input.action === 'deactivate') {
            const { user_id } = input

            const { error: deactErr } = await supabase
                .from('users')
                .update({
                    is_active: false,
                    deactivated_at: new Date().toISOString(),
                    deactivated_by: user.id,
                })
                .eq('id', user_id)

            if (deactErr) throw new Error(`Failed to deactivate user: ${deactErr.message}`)

            // Audit trail
            const { error: auditErr_user_deactivated } = await writeAudit(supabase, {
                action: 'user_deactivated',
                table: 'users',
                recordId: user_id,
                userId: user.id,
            })
            if (auditErr_user_deactivated) console.error(`[manage-admin] Audit failed: ${auditErr_user_deactivated.message}`)

            console.info(`[manage-admin] User deactivated: user=${user_id}, by=${user.id}`)

            return jsonResponse({ success: true, user_id, is_active: false }, origin)
        }

        // ── REACTIVATE ───────────────────────────────
        if (input.action === 'reactivate') {
            const { user_id } = input

            const { error: reactErr } = await supabase
                .from('users')
                .update({
                    is_active: true,
                    deactivated_at: null,
                    deactivated_by: null,
                    reactivated_at: new Date().toISOString(),
                    reactivated_by: user.id,
                })
                .eq('id', user_id)

            if (reactErr) throw new Error(`Failed to reactivate user: ${reactErr.message}`)

            // Audit trail
            const { error: auditErr_user_reactivated } = await writeAudit(supabase, {
                action: 'user_reactivated',
                table: 'users',
                recordId: user_id,
                userId: user.id,
            })
            if (auditErr_user_reactivated) console.error(`[manage-admin] Audit failed: ${auditErr_user_reactivated.message}`)

            console.info(`[manage-admin] User reactivated: user=${user_id}, by=${user.id}`)

            return jsonResponse({ success: true, user_id, is_active: true }, origin)
        }

        throw new Error('Unknown action')

    } catch (error) {
        return errorResponse(error, origin, 'manage-admin')
    }
})
