import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AuthError,
    TimesheetApprovalSchema,
    TimesheetBatchApprovalSchema,
} from '../_shared/security.ts'
import { writeAudit } from '../_shared/audit.ts'
import { fetchInChunks } from '../_shared/fetch-in-chunks.ts'

/**
 * approve-timesheet — aprobar o rechazar una hoja de horas (con bloqueo optimista)
 *
 * - Pueden: admin y payroll_admin (cualquier huerto: la nómina es de la
 *   empresa) y manager (su huerto). Lo decide public.review_timesheet en la BD.
 * - Quien aprueba / rechaza es SIEMPRE quien llama (el verified_by del cuerpo
 *   no cuenta).
 * - Semana de pago cerrada: no se cambia nada (409).
 * - Turno sin salida: no se aprueba (409 SHIFT_OPEN); rechazar pide motivo
 *   de 3 a 200 caracteres.
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

        // ── Lote: «Aprobar todas» en Nómina ───────────────────────────
        // Una llamada por huerto y día en vez de una por persona (con 250
        // personas eran 250 clics y 250 llamadas al día; prueba de carga
        // 2026-10-21). Cada hoja pasa por review_timesheet igual que sola
        // (permisos, semana cerrada) y deja su línea en audit_logs.
        if (Array.isArray(body?.items)) {
            const { items } = TimesheetBatchApprovalSchema.parse(body)
            const ids = items.map(i => i.attendance_id)
            const currentRows = await fetchInChunks<{ id: string; updated_at: string | null }>(ids, (chunk, from, to) =>
                supabase.from('daily_attendance').select('id, updated_at').in('id', chunk).order('id').range(from, to))
            const currentById = new Map(currentRows.map(r => [r.id, r.updated_at]))
            const results: { attendance_id: string; status: 'approved' | 'conflict' | 'error'; updated_at?: string; reason?: string }[] = []
            const auditRows: Record<string, unknown>[] = []
            const now = new Date().toISOString()
            for (const item of items) {
                const serverTs = currentById.get(item.attendance_id)
                if (item.current_updated_at && serverTs && Math.abs(new Date(serverTs).getTime() - new Date(item.current_updated_at).getTime()) > 1000) {
                    results.push({ attendance_id: item.attendance_id, status: 'conflict', reason: 'MODIFIED_SINCE_LOADED' })
                    continue
                }
                const { data: rows, error } = await supabase.rpc('review_timesheet', {
                    p_attendance_id: item.attendance_id,
                    p_decision: 'approve',
                    p_reason: null,
                })
                const updated = (rows as { id: string; updated_at: string }[] | null)?.[0]
                if (error || !updated) {
                    results.push({ attendance_id: item.attendance_id, status: 'error', reason: error?.message ?? 'no row returned' })
                    continue
                }
                results.push({ attendance_id: item.attendance_id, status: 'approved', updated_at: updated.updated_at })
                auditRows.push({
                    action: 'CUSTOM',
                    table_name: 'daily_attendance',
                    record_id: item.attendance_id,
                    user_id: user.id,
                    new_values: { event: 'timesheet_approved', verified_by: user.id, batch: true },
                    created_at: now,
                })
            }
            if (auditRows.length) {
                const { error: auditErr } = await supabase.from('audit_logs').insert(auditRows)
                if (auditErr) throw new Error(`Reviews applied but audit trail failed: ${auditErr.message}`)
            }
            const approved = results.filter(r => r.status === 'approved').length
            console.info(`[approve-timesheet] batch: ${approved}/${items.length} approved by ${user.id}`)
            return jsonResponse({ success: true, approved, results }, origin)
        }

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
            if (reviewErr.message?.includes('SHIFT_OPEN')) {
                throw new AuthError('SHIFT_OPEN: this shift has no check-out yet and cannot be approved', 409)
            }
            if (reviewErr.message?.includes('REJECTION_REASON')) {
                throw new AuthError('REJECTION_REASON: a rejection needs a reason of 3 to 200 characters', 400)
            }
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
