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
import { correctionCovers, shiftHours } from '../_shared/pay-rules.ts'
import { writeAudit } from '../_shared/audit.ts'
import {
    type AttendanceCaller,
    assertCanTouchPicker,
    loadAttendanceCaller,
    lockedPeriodError,
} from '../_shared/attendance-access.ts'
import { DeviceTimeError, resolveDeviceTime, type ResolvedTime } from '../_shared/device-time.ts'

/**
 * manage-attendance — Server-side attendance operations
 *
 * Actions:
 * - check_in:      Open a work shift (closes an open one in another orchard)
 * - check_out:     Record checkout time + paid hours (unpaid 30-min break deducted)
 * - break_start / break_end: meal break from the roll call (one per shift)
 *
 * Time: the server's, unless the phone sends its own (`at`, roll call queued
 * without signal). Then the phone time is corrected with the skew measured now
 * (`client_now`, minus the `clock_skew_ms` the phone already applied), is never
 * in the future, and the applied skew is stored (check_in_clock_skew_ms /
 * check_out_clock_skew_ms; breaks: audit_logs). See _shared/device-time.ts.
 *
 * Roll call without signal: the phone queues check_in / check_out / breaks with
 * the phone time (`at`) and, for check_in, the shift id it generated
 * (`client_id`). Retrying is idempotent: the same check_in returns the same
 * shift, a second check_out or break_end changes nothing. Every response carries
 * `server_time` so the phone can measure its clock skew.
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
    // las horas pagables con el cálculo único (pay-rules.ts). Con la clave de
    // servicio: quien corrige puede no LEER fichajes ajenos (RLS, 20261024021000)
    // y el alcance lo decide assertCanTouchPicker (403), no un «no encontrado».
    const { data: existing, error: fetchExistingErr } = await serviceDb
        .from('daily_attendance')
        .select('picker_id, orchard_id, check_in, check_out, break_start, break_end, break_minutes')
        .eq('id', attendance_id)
        .single()

    if (fetchExistingErr || !existing) {
        throw new Error(`Failed to fetch existing attendance for hours recalculation: ${fetchExistingErr?.message ?? 'not found'}`)
    }

    await assertCanTouchPicker(serviceDb, caller, { pickerId: existing.picker_id, orchardId: existing.orchard_id })

    // Descanso corregido a mano: su fin es inicio + minutos anotados (si no,
    // el pase de lista lo daría por «en descanso»); quitado: sin fin
    if (break_start === null) updatePayload.break_end = null
    else if (break_start) {
        updatePayload.break_end = new Date(Date.parse(break_start) + (existing.break_minutes ?? 30) * 60_000).toISOString()
    }

    const ci = check_in || existing?.check_in
    const co = check_out || existing?.check_out
    if (ci && co) {
        // Hoja corregida a mano: un tramo de más de 14 h se paga entero, si la
        // corrección es posterior a la salida (la de hoy cubre una salida ya puesta)
        updatePayload.hours_worked = shiftHours({
            checkIn: ci,
            checkOut: co,
            breakStart: break_start !== undefined ? break_start : existing?.break_start,
            breakMinutes: existing?.break_minutes,
            corrected: correctionCovers(updatePayload.corrected_at as string, co),
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

/** Hora del fichaje: la del servidor, o la del móvil corregida (ver _shared/device-time.ts) */
function resolveTime(input: { at?: string; client_now?: number; clock_skew_ms?: number | null }): ResolvedTime {
    try {
        return resolveDeviceTime(input.at, Date.now(), input.client_now ?? null, input.clock_skew_ms ?? null)
    } catch (e) {
        if (e instanceof DeviceTimeError) throw new AuthError(e.message, 422)
        throw e
    }
}

/** Día en Nueva Zelanda de un instante */
function nzDate(iso: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(iso))
}

const BREAK_MAX_MINUTES = 120

/** Minutos de descanso entre dos instantes (0–120, lo que admite la tabla) */
function breakMinutesBetween(startIso: string, endIso: string): number {
    const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000)
    return Math.max(0, Math.min(BREAK_MAX_MINUTES, minutes))
}

interface ShiftRow {
    id: string
    picker_id: string
    orchard_id: string
    date: string
    check_in: string | null
    check_out: string | null
    break_start: string | null
    break_end: string | null
    break_minutes: number | null
    hours_worked: number | null
    corrected_at: string | null
}

const SHIFT_COLUMNS = 'id, picker_id, orchard_id, date, check_in, check_out, break_start, break_end, break_minutes, hours_worked, corrected_at'

/**
 * Se busca con la clave de servicio: el alcance lo comprueba después
 * assertCanTouchPicker (403) y la escritura va con el JWT de quien llama (RLS).
 * El tramo por id; si no existe y viene picker_id (la entrada sin red se
 * encontró con un tramo ya abierto y no creó el suyo), el tramo abierto de esa
 * persona ese día.
 */
async function findShift(db: SupabaseLike, id: string, pickerId: string | undefined, at: string): Promise<ShiftRow> {
    const { data: byId } = await db.from('daily_attendance').select(SHIFT_COLUMNS).eq('id', id).maybeSingle()
    if (byId) return byId as ShiftRow
    if (pickerId) {
        const { data: open } = await db.from('daily_attendance').select(SHIFT_COLUMNS)
            .eq('picker_id', pickerId).eq('date', nzDate(at)).is('check_out', null).is('deleted_at', null)
            .order('check_in', { ascending: false }).limit(1).maybeSingle()
        if (open) return open as ShiftRow
    }
    throw new AuthError('SHIFT_NOT_FOUND: this check-in was not found (it may have been deleted).', 404)
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

            // Hora del fichaje: la del servidor; la del móvil corregida si viene de la cola sin red
            const time = resolveTime(input)
            const nowISO = time.at
            const today = nzDate(nowISO)
            const serverTime = new Date().toISOString()

            // Reintento desde la cola: ese tramo ya se creó
            if (input.client_id) {
                const { data: same } = await admin
                    .from('daily_attendance')
                    .select('id, picker_id')
                    .eq('id', input.client_id)
                    .maybeSingle()
                if (same) {
                    if (same.picker_id !== picker_id) throw new AuthError('client_id belongs to another person', 409)
                    return jsonResponse({
                        picker_id, status: 'present', id: same.id, already_checked_in: true, server_time: serverTime,
                    }, origin)
                }
            }

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
                    server_time: serverTime,
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
                    ...(input.client_id ? { id: input.client_id } : {}),
                    picker_id,
                    orchard_id,
                    date: today,
                    check_in: nowISO,
                    check_in_clock_skew_ms: time.skewMs,
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
                server_time: serverTime,
            }, origin)
        }

        // ── CHECK OUT ────────────────────────────────
        if (input.action === 'check_out') {
            const time = resolveTime(input)
            const nowISO = time.at
            const serverTime = new Date().toISOString()
            const record = await findShift(admin, input.attendance_id, input.picker_id, nowISO)
            await assertCanTouchPicker(admin, caller, { pickerId: record.picker_id, orchardId: record.orchard_id })

            // Reintento desde la cola (o ya lo cerró otro): no se toca
            if (record.check_out) {
                return jsonResponse({
                    id: record.id,
                    picker_id: record.picker_id,
                    check_out: record.check_out,
                    hours_worked: Math.max(0, Number(record.hours_worked ?? 0)),
                    already_checked_out: true,
                    server_time: serverTime,
                }, origin)
            }
            if (record.check_in && Date.parse(nowISO) <= Date.parse(record.check_in)) {
                throw new AuthError('CHECK_OUT_BEFORE_CHECK_IN: the check-out time is before the check-in.', 422)
            }

            // Descanso empezado y sin terminar: termina al salir
            const breakUpdate: Record<string, string | number> = {}
            let breakMinutes = record.break_minutes
            if (record.break_start && !record.break_end) {
                breakMinutes = breakMinutesBetween(record.break_start, nowISO)
                breakUpdate.break_end = nowISO
                breakUpdate.break_minutes = breakMinutes
            }

            // Horas pagables con el cálculo único (descanso de 30 min no pagado)
            let hoursWorked: number | undefined
            if (record.check_in) {
                // Una corrección anterior a esta salida no la cubre (tope de 14 h)
                hoursWorked = shiftHours({
                    checkIn: record.check_in,
                    checkOut: nowISO,
                    breakStart: record.break_start,
                    breakMinutes,
                    corrected: correctionCovers(record.corrected_at, nowISO),
                }).hours
            }

            // Update attendance
            const { data: updated, error: updateErr } = await supabase
                .from('daily_attendance')
                .update({
                    check_out: nowISO,
                    check_out_clock_skew_ms: time.skewMs,
                    status: 'present',
                    ...breakUpdate,
                    ...(hoursWorked !== undefined ? { hours_worked: hoursWorked } : {}),
                })
                .eq('id', record.id)
                .select('id, picker_id, check_out')
                .single()

            if (updateErr) throw lockedPeriodError(updateErr.message) ?? new Error(`Failed to update attendance: ${updateErr.message}`)

            // Fichar la salida no da de baja a nadie: pickers.status no cambia

            console.info(`[Attendance] Check-out: picker=${record.picker_id}, hours=${hoursWorked}`)

            return jsonResponse({
                id: updated.id,
                picker_id: updated.picker_id,
                check_out: updated.check_out,
                hours_worked: hoursWorked ?? 0,
                already_checked_out: false,
                server_time: serverTime,
            }, origin)
        }

        // ── BREAK START / END ────────────────────────
        // Un descanso de comida por tramo, desde el pase de lista
        if (input.action === 'break_start' || input.action === 'break_end') {
            const time = resolveTime(input)
            const nowISO = time.at
            const serverTime = new Date().toISOString()
            const record = await findShift(admin, input.attendance_id, input.picker_id, nowISO)
            await assertCanTouchPicker(admin, caller, { pickerId: record.picker_id, orchardId: record.orchard_id })
            const reply = (extra: Record<string, unknown>) => jsonResponse({
                id: record.id, picker_id: record.picker_id, server_time: serverTime, ...extra,
            }, origin)

            let update: Record<string, string | number>
            if (input.action === 'break_start') {
                if (record.break_start && !record.break_end) {
                    return reply({ break_start: record.break_start, break_end: null, already: true })
                }
                if (record.break_start) {
                    throw new AuthError('BREAK_ALREADY_RECORDED: this shift already has a meal break. Change it in Timesheet.', 409)
                }
                if (record.check_out) {
                    throw new AuthError('SHIFT_CLOSED: this person is already checked out.', 409)
                }
                if (record.check_in && Date.parse(nowISO) < Date.parse(record.check_in)) {
                    throw new AuthError('BREAK_BEFORE_CHECK_IN: the break starts before the check-in.', 422)
                }
                update = { break_start: nowISO }
            } else {
                if (!record.break_start) {
                    throw new AuthError('BREAK_NOT_STARTED: there is no break to end.', 409)
                }
                if (record.break_end) {
                    return reply({ break_start: record.break_start, break_end: record.break_end, break_minutes: record.break_minutes, already: true })
                }
                const end = Date.parse(nowISO) < Date.parse(record.break_start) ? record.break_start : nowISO
                update = { break_end: end, break_minutes: breakMinutesBetween(record.break_start, end) }
                // Ya había salido (anotado después): las horas pagables cambian
                if (record.check_in && record.check_out) {
                    update.hours_worked = shiftHours({
                        checkIn: record.check_in,
                        checkOut: record.check_out,
                        breakStart: record.break_start,
                        breakMinutes: update.break_minutes as number,
                        corrected: correctionCovers(record.corrected_at, record.check_out),
                    }).hours
                }
            }

            const { data: saved, error: breakErr } = await supabase
                .from('daily_attendance')
                .update(update)
                .eq('id', record.id)
                .select('id, break_start, break_end, break_minutes')
            if (breakErr) throw lockedPeriodError(breakErr.message) ?? new Error(`Failed to save the break: ${breakErr.message}`)
            if (!saved || saved.length === 0) throw new AuthError('Not allowed to change this timesheet', 403)

            await writeAudit(supabase, {
                action: input.action,
                table: 'daily_attendance',
                recordId: record.id,
                userId: user.id,
                oldValues: { break_start: record.break_start, break_end: record.break_end, break_minutes: record.break_minutes },
                // Hora del móvil: el desfase aplicado queda en la auditoría
                newValues: time.skewMs !== null ? { ...update, clock_skew_ms: time.skewMs } : update,
            })

            return reply({
                break_start: saved[0].break_start,
                break_end: saved[0].break_end,
                break_minutes: saved[0].break_minutes,
                already: false,
            })
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
