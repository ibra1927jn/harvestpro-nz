import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    AuthError,
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AttendanceInputSchema,
} from '../_shared/security.ts'
import { shiftHours } from '../_shared/pay-rules.ts'
import { writeAudit } from '../_shared/audit.ts'
import { fetchAllRows } from '../_shared/fetch-all-rows.ts'

/**
 * manage-attendance — Server-side attendance operations
 *
 * Actions:
 * - check_in:      Open a work shift (closes an open one in another orchard)
 * - check_out:     Record checkout time + paid hours (unpaid 30-min break deducted)
 * - correct:       Timesheet correction with audit trail
 * - correct_batch: The same correction applied to up to 200 timesheets at once
 *                  (one audit row per timesheet, per-item results, a failing
 *                  item does not abort the batch)
 *
 * Security: Requires admin/manager/team_leader role. Corrections (single and
 * batch) are scoped: admin anywhere, manager their own orchard, team leader
 * only the people of their own team (pickers.team_leader_id = caller); nobody
 * corrects their own timesheet (except admin).
 */

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any }

interface CorrectionItem {
    attendance_id: string
    check_in?: string
    check_out?: string
    break_start?: string | null
}

/**
 * Alcance de quien corrige (se carga UNA vez por petición, también para el lote):
 * - admin: cualquier fichaje.
 * - manager: los de su huerto.
 * - team_leader: los de su huerto Y de su equipo (pickers.team_leader_id = él).
 * Nadie (salvo admin) corrige su propio fichaje. El RLS ya impide parte de
 * esto, pero el alcance de equipo del team leader no está en la BD (la
 * política «Manage attendance» le deja todo el huerto): se comprueba aquí,
 * igual que lo filtra el editor.
 */
interface CorrectionScope {
    userId: string
    role: string
    orchardId: string | null
    /** Ids de pickers del equipo (solo team_leader); null = sin límite de equipo */
    teamPickerIds: Set<string> | null
}

async function loadCorrectionScope(supabase: SupabaseLike, userId: string): Promise<CorrectionScope> {
    const { data: me, error: meErr } = await supabase
        .from('users')
        .select('role, orchard_id')
        .eq('id', userId)
        .single()
    if (meErr || !me) throw new Error(`Failed to load caller profile: ${meErr?.message ?? 'not found'}`)

    let teamPickerIds: Set<string> | null = null
    if (me.role === 'team_leader') {
        // Un equipo son decenas de personas, pero PostgREST corta en 1000 sin avisar
        const team = await fetchAllRows<{ id: string }>((from, to) =>
            supabase.from('pickers').select('id').eq('team_leader_id', userId).order('id').range(from, to),
        )
        teamPickerIds = new Set(team.map(p => p.id))
    }
    return { userId, role: me.role, orchardId: me.orchard_id ?? null, teamPickerIds }
}

/** 403 si el fichaje queda fuera del alcance de quien corrige */
function assertInScope(scope: CorrectionScope, row: { picker_id: string; orchard_id: string }): void {
    if (scope.role === 'admin') return
    if (row.picker_id === scope.userId) {
        throw new AuthError('You cannot correct your own timesheet', 403)
    }
    if (row.orchard_id !== scope.orchardId) {
        throw new AuthError('You can only correct timesheets of your own orchard', 403)
    }
    if (scope.teamPickerIds && !scope.teamPickerIds.has(row.picker_id)) {
        throw new AuthError('You can only correct timesheets of your own team', 403)
    }
}

/**
 * Aplica UNA corrección (la usan `correct` y `correct_batch`): comprueba el
 * alcance, recalcula las horas pagables, escribe la fila y deja la auditoría.
 * Quien corrige es siempre quien llama. Si RLS deja la fila sin tocar → 403
 * (no se audita un cambio que no hubo).
 */
async function applyCorrection(
    supabase: SupabaseLike,
    scope: CorrectionScope,
    item: CorrectionItem,
    reason: string,
): Promise<void> {
    const { attendance_id, check_in, check_out, break_start } = item
    const userId = scope.userId

    // Build update payload. Quien corrige es quien llama: antes se guardaba
    // el admin_id del cuerpo (firmar en nombre de otro).
    const updatePayload: Record<string, string | number | null> = {
        correction_reason: reason,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
    }

    if (check_in) updatePayload.check_in = check_in
    if (check_out) updatePayload.check_out = check_out
    if (break_start !== undefined) updatePayload.break_start = break_start

    // Fila actual: para el alcance (huerto / equipo / propio) y para recalcular
    // las horas pagables con el cálculo único (pay-rules.ts)
    const { data: existing, error: fetchExistingErr } = await supabase
        .from('daily_attendance')
        .select('picker_id, orchard_id, check_in, check_out, break_start, break_minutes')
        .eq('id', attendance_id)
        .single()

    if (fetchExistingErr || !existing) {
        throw new Error(`Failed to fetch existing attendance for hours recalculation: ${fetchExistingErr?.message ?? 'not found'}`)
    }

    assertInScope(scope, existing)

    const ci = check_in || existing?.check_in
    const co = check_out || existing?.check_out
    if (ci && co) {
        updatePayload.hours_worked = shiftHours({
            checkIn: ci,
            checkOut: co,
            breakStart: break_start !== undefined ? break_start : existing?.break_start,
            breakMinutes: existing?.break_minutes,
        }).hours
    }

    // Apply correction
    const { data: corrected, error: corrErr } = await supabase
        .from('daily_attendance')
        .update(updatePayload)
        .eq('id', attendance_id)
        .select('id')

    if (corrErr) throw new Error(`Failed to apply correction: ${corrErr.message}`)
    // RLS puede dejar la fila sin tocar sin dar error (p. ej. el propio
    // fichaje): antes se respondía success y se auditaba un cambio que no hubo
    if (!corrected || corrected.length === 0) {
        throw new AuthError('Not allowed to correct this timesheet', 403)
    }

    // Audit trail — must succeed for compliance (una fila por fichaje)
    const { error: auditErr } = await writeAudit(supabase, {
        action: 'timesheet_correction',
        table: 'daily_attendance',
        recordId: attendance_id,
        userId,
        oldValues: {
            check_in: existing.check_in,
            check_out: existing.check_out,
            break_start: existing.break_start,
            break_minutes: existing.break_minutes,
        },
        newValues: { check_in, check_out, break_start },
        reason,
    })

    if (auditErr) throw new Error(`Correction applied but audit trail failed: ${auditErr.message}`)

    console.info(`[Attendance] Correction applied: id=${attendance_id}, by=${userId}`)
}

/** Lotes de N en paralelo (un lote de 200 secuencial tardaría demasiado) */
const BATCH_CONCURRENCY = 10

serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'team_leader'])
        checkRateLimit(user.id)

        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        // El auth check de arriba garantiza que solo usuarios autenticados pueden hacer warmup.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'manage-attendance' }, origin)
        }

        const input = AttendanceInputSchema.parse(body)

        // ── CHECK IN ─────────────────────────────────
        if (input.action === 'check_in') {
            const { picker_id, orchard_id } = input

            // Solo se ficha en el huerto propio (admin en cualquiera) y nunca a uno mismo.
            // Se comprueba ANTES de cerrar el tramo de otro huerto con la clave de servicio.
            const { data: me } = await supabase.from('users').select('role, orchard_id').eq('id', user.id).single()
            if (me?.role !== 'admin' && me?.orchard_id !== orchard_id) {
                throw new AuthError('You can only check people in to your own orchard', 403)
            }
            if (picker_id === user.id && me?.role !== 'admin') {
                throw new AuthError('You cannot check yourself in', 403)
            }

            // Get today's date in NZST
            const today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Pacific/Auckland',
            }).format(new Date())

            const nowISO = new Date().toISOString()

            // Tramos: una persona puede trabajar en varios huertos el mismo día
            // (sale de A y entra en B). Como mucho un tramo abierto por día.
            // El tramo abierto puede estar en otro huerto que quien ficha no ve por
            // RLS (un team leader solo ve su huerto): se busca y se cierra con la
            // clave de servicio. Antes el alta fallaba con "duplicate key".
            const admin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            )
            const { data: open } = await admin
                .from('daily_attendance')
                .select('id, orchard_id')
                .eq('picker_id', picker_id)
                .eq('date', today)
                .is('check_out', null)
                .is('deleted_at', null)
                .maybeSingle()

            if (open && open.orchard_id === orchard_id) {
                // Ya está trabajando aquí. La presencia sale de daily_attendance: no se
                // toca pickers.status (situación laboral), así no se reactiva a nadie archivado.
                return jsonResponse({
                    picker_id,
                    status: 'present',
                    id: open.id,
                    already_checked_in: true,
                }, origin)
            }

            let closedShiftId: string | null = null
            if (open) {
                // Sigue abierto en otro huerto: se cierra ahora y se marca para que
                // el team leader o el manager revisen la hora de salida real.
                // El tiempo de viaje entre huertos no se paga.
                const { error: closeErr } = await admin
                    .from('daily_attendance')
                    .update({
                        check_out: nowISO,
                        notes: 'Auto-closed: checked in at another orchard. Review check-out time.',
                    })
                    .eq('id', open.id)
                    .is('check_out', null)
                if (closeErr) throw new Error(`Failed to close previous shift: ${closeErr.message}`)
                closedShiftId = open.id
                await writeAudit(admin, {
                    action: 'shift_auto_closed',
                    table: 'daily_attendance',
                    recordId: open.id,
                    userId: user.id,
                    newValues: { check_out: nowISO, moved_to_orchard: orchard_id },
                })
            }

            // Create new attendance record
            const { data: attendance, error: insertErr } = await supabase
                .from('daily_attendance')
                .insert({
                    picker_id,
                    orchard_id,
                    date: today,
                    check_in: nowISO,
                    status: 'present',
                    // Quien ficha queda como recorded_by (el verified_by del cuerpo no
                    // cuenta). verified_by es la APROBACIÓN de nómina/manager
                    // (approve-timesheet): antes se ponía aquí y toda hoja de horas
                    // nacía aprobada, sin nada pendiente en Nómina.
                    recorded_by: user.id,
                })
                .select('id')
                .single()

            if (insertErr) throw new Error(`Failed to create attendance: ${insertErr.message}`)

            // La presencia queda en daily_attendance; pickers.status no cambia al fichar

            console.info(`[Attendance] Check-in: picker=${picker_id}, orchard=${orchard_id}`)

            return jsonResponse({
                picker_id,
                status: 'present',
                id: attendance.id,
                already_checked_in: false,
                closed_shift_id: closedShiftId,
            }, origin)
        }

        // ── CHECK OUT ────────────────────────────────
        if (input.action === 'check_out') {
            const { attendance_id } = input
            const nowISO = new Date().toISOString()

            // Fetch check-in time
            const { data: record, error: fetchErr } = await supabase
                .from('daily_attendance')
                .select('id, picker_id, check_in, break_start, break_minutes')
                .eq('id', attendance_id)
                .single()

            if (fetchErr || !record) throw new Error(`Attendance record not found: ${fetchErr?.message}`)

            // Horas pagables con el cálculo único (descanso de 30 min no pagado)
            let hoursWorked: number | undefined
            if (record.check_in) {
                hoursWorked = shiftHours({
                    checkIn: record.check_in,
                    checkOut: nowISO,
                    breakStart: record.break_start,
                    breakMinutes: record.break_minutes,
                }).hours
            }

            // Update attendance
            const { data: updated, error: updateErr } = await supabase
                .from('daily_attendance')
                .update({
                    check_out: nowISO,
                    status: 'present',
                    ...(hoursWorked !== undefined ? { hours_worked: hoursWorked } : {}),
                })
                .eq('id', attendance_id)
                .select('id, picker_id, check_out')
                .single()

            if (updateErr) throw new Error(`Failed to update attendance: ${updateErr.message}`)

            // Fichar la salida no da de baja a nadie: pickers.status no cambia

            console.info(`[Attendance] Check-out: picker=${record.picker_id}, hours=${hoursWorked}`)

            return jsonResponse({
                id: updated.id,
                picker_id: updated.picker_id,
                check_out: updated.check_out,
                hours_worked: hoursWorked,
            }, origin)
        }

        // ── CORRECT ──────────────────────────────────
        if (input.action === 'correct') {
            const { attendance_id, check_in, check_out, break_start, reason } = input
            const scope = await loadCorrectionScope(supabase, user.id)
            await applyCorrection(supabase, scope, { attendance_id, check_in, check_out, break_start }, reason)
            return jsonResponse({ success: true, attendance_id }, origin)
        }

        // ── CORRECT BATCH ────────────────────────────
        // La misma corrección para varios fichajes (p. ej. «salida a las 16:30
        // para todos»): resultados por índice, una fila de auditoría por
        // fichaje y los errores de una fila no tiran el lote.
        if (input.action === 'correct_batch') {
            const { items, reason } = input
            // Alcance (huerto / equipo) una sola vez para todo el lote
            const scope = await loadCorrectionScope(supabase, user.id)
            const results: Array<{ index: number; attendance_id: string; success: boolean; error?: string }> =
                new Array(items.length)

            for (let start = 0; start < items.length; start += BATCH_CONCURRENCY) {
                const chunk = items.slice(start, start + BATCH_CONCURRENCY)
                await Promise.all(chunk.map(async (item, offset) => {
                    const index = start + offset
                    try {
                        await applyCorrection(supabase, scope, item, reason)
                        results[index] = { index, attendance_id: item.attendance_id, success: true }
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err)
                        console.warn(`[Attendance] Batch correction failed: id=${item.attendance_id}, by=${user.id}: ${message}`)
                        results[index] = { index, attendance_id: item.attendance_id, success: false, error: message }
                    }
                }))
            }

            const succeeded = results.filter(r => r.success).length
            const failed = results.length - succeeded
            console.info(`[Attendance] Batch correction: ${succeeded}/${results.length} applied, by=${user.id}`)

            return jsonResponse({
                success: failed === 0,
                total: results.length,
                succeeded,
                failed,
                results,
            }, origin)
        }

        throw new Error(`Unknown action`)

    } catch (error) {
        return errorResponse(error, origin, 'manage-attendance')
    }
})
