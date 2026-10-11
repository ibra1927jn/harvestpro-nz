import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    TimesheetApprovalSchema,
} from '../_shared/security.ts'
import { writeAudit } from '../_shared/audit.ts'

/**
 * approve-timesheet — Server-side timesheet approval with optimistic locking
 *
 * Ensures:
 * - Only authorized managers can approve timesheets
 * - Optimistic locking prevents stale approvals
 * - Audit trail for every approval
 *
 * Security: Requires admin/manager role
 */
serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin', 'manager'])
        checkRateLimit(user.id)

        const body = await req.json()
        const { attendance_id, verified_by, current_updated_at } = TimesheetApprovalSchema.parse(body)

        // ── Optimistic Locking Check ─────────────────
        if (current_updated_at) {
            const { data: current } = await supabase
                .from('daily_attendance')
                .select('updated_at')
                .eq('id', attendance_id)
                .single()

            // L-4: Use numeric timestamp comparison to avoid ISO string format differences
            if (current && current.updated_at) {
                const serverTs = new Date(current.updated_at).getTime()
                const clientTs = new Date(current_updated_at).getTime()
                if (Math.abs(serverTs - clientTs) > 1000) {  // 1s tolerance for rounding
                    throw new Error(
                        'Timesheet has been modified since you loaded it. ' +
                        'Please refresh and try again.'
                    )
                }
            }
        }

        // ── Apply Approval ───────────────────────────
        const { data: updated, error: updateErr } = await supabase
            .from('daily_attendance')
            .update({
                verified_by,
                updated_at: new Date().toISOString(),
            })
            .eq('id', attendance_id)
            .select('id, picker_id, verified_by, updated_at')
            .single()

        if (updateErr) throw new Error(`Failed to approve timesheet: ${updateErr.message}`)

        // ── Audit Trail — must succeed for compliance ──
        const { error: auditErr } = await writeAudit(supabase, {
            action: 'timesheet_approved',
            table: 'daily_attendance',
            recordId: attendance_id,
            userId: user.id,
            newValues: { verified_by },
        })

        if (auditErr) throw new Error(`Approval applied but audit trail failed: ${auditErr.message}`)

        console.info(`[approve-timesheet] Approved: id=${attendance_id}, by=${user.id}`)

        return jsonResponse({
            success: true,
            attendance_id: updated.id,
            picker_id: updated.picker_id,
            verified_by: updated.verified_by,
            updated_at: updated.updated_at,
        }, origin)

    } catch (error) {
        return errorResponse(error, origin, 'approve-timesheet')
    }
})
