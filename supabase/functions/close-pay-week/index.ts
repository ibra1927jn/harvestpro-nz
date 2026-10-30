/**
 * close-pay-week — Cerrar o reabrir una semana de pago (lunes–domingo, NZ).
 *
 * close:  solo semanas ya terminadas, sin horas estimadas (tramos sin cerrar)
 *         y con todos los tramos aprobados: ninguna hora se paga sin revisar
 *         (unreviewedShifts de _shared/pay-rules.ts: sin aprobar, rechazados o
 *         de más de 14 h sin corregir).
 *         Guarda la foto de la nómina (mismo cálculo que calculate-payroll) y, a
 *         partir de ahí, la base de datos no deja cambiar fichajes ni cubetas
 *         de esos días.
 * reopen: con motivo. Vuelve a permitir cambios; al cerrar de nuevo se guarda
 *         una foto nueva. Todo queda en audit_logs.
 *
 * Roles: payroll_admin y admin.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'npm:zod@^4.3.6'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
} from '../_shared/security.ts'
import { computePayroll } from '../_shared/payroll-calc.ts'
import { payWeekOf, nzDateOf, unreviewedShifts, type ReviewableShift } from '../_shared/pay-rules.ts'
import { fetchAllRows } from '../_shared/fetch-all-rows.ts'
import { fetchInChunks } from '../_shared/fetch-in-chunks.ts'
import { writeAudit } from '../_shared/audit.ts'

const InputSchema = z.object({
    action: z.enum(['close', 'reopen', 'status']),
    week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().max(500).optional(),
})

serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight
    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin', 'payroll_admin'])
        checkRateLimit(user.id, { maxRequests: 10, windowMs: 60_000 })

        const body = await req.json()
        if (body?._warmup === true) return jsonResponse({ status: 'warm', function: 'close-pay-week' }, origin)
        const { action, week_start, reason } = InputSchema.parse(body)

        const week = payWeekOf(week_start)
        if (week.start !== week_start) throw new Error(`week_start must be a Monday (got ${week_start}, week starts ${week.start})`)

        // Escritura en pay_weeks solo con service role (sin políticas de escritura)
        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        const { data: current } = await admin
            .from('pay_weeks')
            .select('id, week_start, status, closed_at, closed_by, total_earnings, reopened_at, reopen_reason')
            .eq('week_start', week.start)
            .maybeSingle()

        if (action === 'status') {
            return jsonResponse({ week, pay_week: current ?? null }, origin)
        }

        if (action === 'close') {
            if (current?.status === 'closed') {
                return jsonResponse({ week, pay_week: current, already_closed: true }, origin)
            }
            const today = nzDateOf(new Date())
            if (today <= week.end) {
                throw new Error(`WEEK_NOT_FINISHED: the pay week ${week.start} → ${week.end} has not finished yet`)
            }

            // Mismo cálculo que la pantalla de Nómina (toda la empresa)
            const payroll = await computePayroll(supabase, { start_date: week.start, end_date: week.end })

            // No se paga con horas estimadas: hay que cerrar antes esos tramos
            const pending = payroll.picker_breakdown
                .filter(p => p.estimated_days > 0)
                .map(p => ({
                    picker_id: p.picker_id,
                    picker_name: p.picker_name,
                    dates: p.days.filter(d => d.estimated).map(d => d.date),
                }))
            if (pending.length > 0) {
                return jsonResponse({ week, closed: false, reason: 'ESTIMATED_HOURS', pending }, origin)
            }

            // Ninguna hora se paga sin revisar: todos los tramos de la semana (de
            // todos los huertos) aprobados, ninguno rechazado sin volver a aprobar
            const shifts = await fetchAllRows<ReviewableShift>((from, to) => supabase
                .from('daily_attendance')
                .select('id, picker_id, date, check_in, check_out, corrected_at, verified_at, rejected_at')
                .is('deleted_at', null)
                .gte('date', week.start)
                .lte('date', week.end)
                .order('id')
                .range(from, to))
            const issues = unreviewedShifts(shifts, week)
            if (issues.length > 0) {
                const ids = [...new Set(issues.map(i => i.pickerId))]
                const names = await fetchInChunks<{ id: string; name: string }>(ids, (chunk, from, to) =>
                    supabase.from('pickers').select('id, name').in('id', chunk).order('id').range(from, to))
                const nameById = new Map(names.map(n => [n.id, n.name]))
                const unreviewed = ids.map(id => {
                    const mine = issues.filter(i => i.pickerId === id)
                    return {
                        picker_id: id,
                        picker_name: nameById.get(id) ?? 'Unknown',
                        dates: [...new Set(mine.map(i => i.date))],
                        issues: mine.map(i => ({ date: i.date, issue: i.issue })),
                    }
                })
                return jsonResponse({ week, closed: false, reason: 'UNREVIEWED_HOURS', pending: unreviewed }, origin)
            }

            const nowIso = new Date().toISOString()
            const { data: saved, error: upsertErr } = await admin.from('pay_weeks').upsert({
                week_start: week.start,
                week_end: week.end,
                status: 'closed',
                closed_by: user.id,
                closed_at: nowIso,
                snapshot: payroll,
                total_earnings: payroll.summary.total_earnings,
                updated_at: nowIso,
            }).select('id').single()
            if (upsertErr) throw new Error(`Failed to close week: ${upsertErr.message}`)

            const { error: auditErr } = await writeAudit(admin, {
                action: 'pay_week_closed',
                table: 'pay_weeks',
                recordId: saved.id,
                userId: user.id,
                newValues: { week_start: week.start, week_end: week.end, total_earnings: payroll.summary.total_earnings, workers: payroll.compliance.workers_total },
            })
            if (auditErr) console.error(`[PayWeek] Audit failed: ${auditErr.message}`)
            console.info(`[PayWeek] Closed ${week.start} by ${user.id}: $${payroll.summary.total_earnings}`)
            return jsonResponse({ week, closed: true, total_earnings: payroll.summary.total_earnings }, origin)
        }

        // reopen
        if (!current || current.status !== 'closed') {
            throw new Error(`WEEK_NOT_CLOSED: the pay week ${week.start} is not closed`)
        }
        if (!reason || reason.length < 5) {
            throw new Error('REASON_REQUIRED: say why the week is being reopened (at least 5 characters)')
        }
        const nowIso = new Date().toISOString()
        const { error: reopenErr } = await admin.from('pay_weeks').update({
            status: 'reopened',
            reopened_by: user.id,
            reopened_at: nowIso,
            reopen_reason: reason,
            updated_at: nowIso,
        }).eq('week_start', week.start)
        if (reopenErr) throw new Error(`Failed to reopen week: ${reopenErr.message}`)

        const { error: auditErr } = await writeAudit(admin, {
            action: 'pay_week_reopened',
            table: 'pay_weeks',
            recordId: current.id,
            userId: user.id,
            newValues: { week_start: week.start },
            oldValues: { closed_at: current.closed_at, total_earnings: current.total_earnings },
            reason,
        })
        if (auditErr) console.error(`[PayWeek] Audit failed: ${auditErr.message}`)
        console.info(`[PayWeek] Reopened ${week.start} by ${user.id}: ${reason}`)
        return jsonResponse({ week, reopened: true }, origin)
    } catch (error) {
        return errorResponse(error, origin, 'PayWeek')
    }
})
