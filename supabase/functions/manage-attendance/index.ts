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
import {
    type AttendanceCaller,
    assertCanTouchPicker,
    loadAttendanceCaller,
    lockedPeriodError,
} from '../_shared/attendance-access.ts'

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
 * Security: Requires admin/manager/team_leader role. Every action that
 * writes (check_in, check_out, correct, correct_batch) goes through ONE rule,
 * assertCanTouchPicker (_shared/attendance-access.ts, same as the RLS policy
 * "Manage attendance"): admin anywhere, manager their own orchard, team leader
 * only people of their own team or without a team (never another team);
 * nobody but admin touches their own timesheet.
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
 * Aplica UNA corrección (la usan `correct` y `correct_batch`): comprueba el
 * alcance, recalcula las horas pagables, escribe la fila y deja la auditoría.
 * Quien corrige es siempre quien llama. Si RLS deja la fila sin tocar → 403
 * (no se audita un cambio que no hubo).
 */
async function applyCorrection(
    supabase: SupabaseLike,
    serviceDb: SupabaseLike,
    caller: AttendanceCaller,
    item: CorrectionItem,
    reason: string,
): Promise<void> {
    const { attendance_id, check_in, check_out, break_start } = item
    const userId = caller.id

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

    await assertCanTouchPicker(serviceDb, caller, { pickerId: existing.picker_id, orchardId: existing.orchard_id })

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

    if (corrErr) throw lockedPeriodError(corrErr.message) ?? new Error(`Failed to apply correction: ${corrErr.message}`)
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
        const caller = await loadAttendanceCaller(supabase, user.id)
        // Clave de servicio: ve la ficha de la persona (equipo) y el turno
        // abierto en otro huerto, que quien ficha no ve por RLS
        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        // ── CHECK IN ─────────────────────────────────
        if (input.action === 'check_in') {
            const { picker_id, orchard_id } = input

            // Solo se ficha en el huerto propio (admin en cualquiera), el team
            // leader solo a su equipo o a gente sin equipo, y nunca a uno mismo.
            // Se comprueba ANTES de cerrar el tramo de otro huerto con la clave de servicio.
            if (picker_id === user.id && caller.role !== 'admin') {
                throw new AuthError('You cannot check yourself in', 403)
            }
            await assertCanTouchPicker(admin, caller, { pickerId: picker_id, orchardId: orchard_id })

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
                if (closeErr) throw lockedPeriodError(closeErr.message) ?? new Error(`Failed to close previous shift: ${closeErr.message}`)
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

            if (insertErr) throw lockedPeriodError(insertErr.message) ?? new Error(`Failed to create attendance: ${insertErr.message}`)

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
                .select('id, picker_id, orchard_id, check_in, break_start, break_minutes')
                .eq('id', attendance_id)
                .single()

            if (fetchErr || !record) throw new Error(`Attendance record not found: ${fetchErr?.message}`)
            await assertCanTouchPicker(admin, caller, { pickerId: record.picker_id, orchardId: record.orchard_id })

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

            if (updateErr) throw lockedPeriodError(updateErr.message) ?? new Error(`Failed to update attendance: ${updateErr.message}`)

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
            await applyCorrection(supabase, admin, caller, { attendance_id, check_in, check_out, break_start }, reason)
            return jsonResponse({ success: true, attendance_id }, origin)
        }

        // ── CORRECT BATCH ────────────────────────────
        // La misma corrección para varios fichajes (p. ej. «salida a las 16:30
        // para todos»): resultados por índice, una fila de auditoría por
        // fichaje y los errores de una fila no tiran el lote.
        if (input.action === 'correct_batch') {
            const { items, reason } = input
            // Quien llama se cargó una vez; la caché de equipos de `caller` vale para todo el lote
            const results: Array<{ index: number; attendance_id: string; success: boolean; error?: string }> =
                new Array(items.length)

            for (let start = 0; start < items.length; start += BATCH_CONCURRENCY) {
                const chunk = items.slice(start, start + BATCH_CONCURRENCY)
                await Promise.all(chunk.map(async (item, offset) => {
                    const index = start + offset
                    try {
                        await applyCorrection(supabase, admin, caller, item, reason)
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
