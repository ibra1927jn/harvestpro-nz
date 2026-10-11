import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    AttendanceInputSchema,
} from '../_shared/security.ts'
import { shiftHours } from '../_shared/pay-rules.ts'
import { writeAudit } from '../_shared/audit.ts'

/**
 * manage-attendance — Server-side attendance operations
 *
 * Actions:
 * - check_in:  Create attendance record + update picker status
 * - check_out: Record checkout time + paid hours (unpaid 30-min break deducted)
 * - correct:   Admin timesheet correction with audit trail
 *
 * Security: Requires admin/manager/team_leader role
 */
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
            const { picker_id, orchard_id, verified_by } = input

            // Get today's date in NZST
            const today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Pacific/Auckland',
            }).format(new Date())

            const nowISO = new Date().toISOString()

            // Check if already checked in today
            const { data: existing } = await supabase
                .from('daily_attendance')
                .select('id')
                .eq('picker_id', picker_id)
                .eq('orchard_id', orchard_id)
                .eq('date', today)
                .maybeSingle()

            if (existing) {
                // Ya fichado hoy. La presencia sale de daily_attendance: no se toca
                // pickers.status (situación laboral), así no se reactiva a nadie archivado.
                return jsonResponse({
                    picker_id,
                    status: 'present',
                    id: existing.id,
                    already_checked_in: true,
                }, origin)
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
                    verified_by: verified_by || user.id,
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
            const { attendance_id, check_in, check_out, break_start, reason, admin_id } = input

            // Build update payload
            const updatePayload: Record<string, string | number | null> = {
                correction_reason: reason,
                corrected_by: admin_id,
                corrected_at: new Date().toISOString(),
            }

            if (check_in) updatePayload.check_in = check_in
            if (check_out) updatePayload.check_out = check_out
            if (break_start !== undefined) updatePayload.break_start = break_start

            // Recalcular horas pagables con el cálculo único (pay-rules.ts)
            const { data: existing, error: fetchExistingErr } = await supabase
                .from('daily_attendance')
                .select('check_in, check_out, break_start, break_minutes')
                .eq('id', attendance_id)
                .single()

            if (fetchExistingErr) {
                throw new Error(`Failed to fetch existing attendance for hours recalculation: ${fetchExistingErr.message}`)
            }

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
            const { error: corrErr } = await supabase
                .from('daily_attendance')
                .update(updatePayload)
                .eq('id', attendance_id)

            if (corrErr) throw new Error(`Failed to apply correction: ${corrErr.message}`)

            // Audit trail — must succeed for compliance
            const { error: auditErr } = await writeAudit(supabase, {
                action: 'timesheet_correction',
                table: 'daily_attendance',
                recordId: attendance_id,
                userId: admin_id,
                oldValues: existing ?? undefined,
                newValues: { check_in, check_out, break_start },
                reason,
            })

            if (auditErr) throw new Error(`Correction applied but audit trail failed: ${auditErr.message}`)

            console.info(`[Attendance] Correction applied: id=${attendance_id}, by=${admin_id}`)

            return jsonResponse({ success: true, attendance_id }, origin)
        }

        throw new Error(`Unknown action`)

    } catch (error) {
        return errorResponse(error, origin, 'manage-attendance')
    }
})
