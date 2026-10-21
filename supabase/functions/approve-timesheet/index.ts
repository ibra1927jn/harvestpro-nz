import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AuthError,
    TimesheetApprovalSchema,
} from '../_shared/security.ts'
import { writeAudit } from '../_shared/audit.ts'

/**
 * approve-timesheet — aprobar o rechazar una hoja de horas (con bloqueo optimista)
 *
 * - Pueden: admin y payroll_admin (cualquier huerto: la nómina es de la
 *   empresa) y manager (su huerto). Lo decide public.review_timesheet en la BD.
 * - Quien aprueba / rechaza es SIEMPRE quien llama (el verified_by del cuerpo
 *   no cuenta).
 * - Semana de pago cerrada: no se cambia nada (409).
 * - Cada decisión queda en audit_logs.
 */
serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'payroll_admin'])
        checkRateLimit(user.id)

        const body = await req.json()
        const { attendance_id, current_updated_at, decision, reason } = TimesheetApprovalSchema.parse(body)

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

        // ── Aprobar / rechazar (reglas en la BD) ─────
        const { data: rows, error: reviewErr } = await supabase.rpc('review_timesheet', {
            p_attendance_id: attendance_id,
            p_decision: decision,
            p_reason: decision === 'reject' ? (reason ?? null) : null,
        })
        if (reviewErr) {
            if (reviewErr.code === '42501') throw new AuthError(reviewErr.message, 403)
            if (reviewErr.message?.includes('PAY_WEEK_CLOSED')) {
                throw new AuthError('PAY_WEEK_CLOSED: the pay week of this timesheet is closed. Reopen it to change timesheets.', 409)
            }
            throw new Error(`Failed to ${decision} timesheet: ${reviewErr.message}`)
        }
        const updated = (rows as { id: string; picker_id: string; verified_by: string | null; rejected_by: string | null; updated_at: string }[] | null)?.[0]
        if (!updated) throw new Error(`Failed to ${decision} timesheet: no row returned`)

        // ── Audit Trail — must succeed for compliance ──
        const { error: auditErr } = await writeAudit(supabase, {
            action: decision === 'approve' ? 'timesheet_approved' : 'timesheet_rejected',
            table: 'daily_attendance',
            recordId: attendance_id,
            userId: user.id,
            newValues: decision === 'approve' ? { verified_by: user.id } : { rejected_by: user.id },
            ...(decision === 'reject' && reason ? { reason } : {}),
        })

        if (auditErr) throw new Error(`Review applied but audit trail failed: ${auditErr.message}`)

        console.info(`[approve-timesheet] ${decision}: id=${attendance_id}, by=${user.id}`)

        return jsonResponse({
            success: true,
            decision,
            attendance_id: updated.id,
            picker_id: updated.picker_id,
            verified_by: updated.verified_by,
            rejected_by: updated.rejected_by,
            updated_at: updated.updated_at,
        }, origin)

    } catch (error) {
        return errorResponse(error, origin, 'approve-timesheet')
    }
})
