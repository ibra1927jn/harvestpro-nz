import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    ComplianceCheckSchema,
    AuthError,
} from '../_shared/security.ts'
import { attendanceRowOf, payForRange, pieceRateOn, nzDateOf, isNZPublicHoliday, PAY_RULES } from '../_shared/pay-rules.ts'
import { loadDailyPieceRates } from '../_shared/piece-rates.ts'
import { pieceRatesReader } from '../_shared/rates-client.ts'
import { orchardDayView } from '../_shared/payroll-orchard.ts'

/**
 * check-compliance — Server-side NZ Employment Relations Act compliance
 *
 * Implements NZ labor law requirements:
 * - Rest breaks: 10min paid break every 2 hours
 * - Meal breaks: 30min paid break every 4 hours
 * - Minimum wage: $23.95/hr (piece-rate workers must earn at least this, 2026-2027)
 * - Max consecutive hours before mandatory break
 *
 * Security: Requires admin/manager/team_leader role
 */

// ── NZ Employment Law Constants ──────────────────────
const NZ_CONSTANTS = {
    MINIMUM_WAGE: 23.95,       // NZD per hour (2026-2027, Minimum Wage Order 2026)
    REST_BREAK_INTERVAL: 120,  // minutes (10min break every 2 hours)
    REST_BREAK_DURATION: 10,   // minutes
    MEAL_BREAK_INTERVAL: 240,  // minutes (30min break every 4 hours)
    MEAL_BREAK_DURATION: 30,   // minutes
    MAX_CONSECUTIVE_HOURS: 6,  // hours before mandatory longer break
    MAX_DAILY_HOURS: 13,       // recommended max daily hours
    HYDRATION_INTERVAL: 45,    // minutes between hydration reminders
    PIECE_RATE: 3.50,          // NZD per bucket (default)
}

interface ComplianceViolation {
    type: 'break_overdue' | 'wage_below_minimum' | 'excessive_hours' | 'hydration_reminder'
    severity: 'low' | 'medium' | 'high'
    message: string
    details: Record<string, unknown>
}

interface PickerCompliance {
    picker_id: string
    picker_name: string
    is_compliant: boolean
    violations: ComplianceViolation[]
    metrics: {
        hours_worked: number
        buckets_today: number
        effective_hourly_rate: number
        minimum_wage: number
        is_below_minimum: boolean
        top_up_required: number
    }
}

serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase, role } = await requireRole(req, ['admin', 'manager', 'team_leader'])
        checkRateLimit(user.id)

        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'check-compliance' }, origin)
        }

        const { orchard_id, picker_ids } = ComplianceCheckSchema.parse(body)

        // Manager y team leader: solo su huerto, y de la paga solo la parte de su
        // huerto (decisión del dueño, 2026-10-27). Admin ve el día entero.
        const ownOrchardOnly = role !== 'admin'
        if (ownOrchardOnly) {
            const { data: me } = await supabase.from('users').select('orchard_id').eq('id', user.id).maybeSingle()
            if (!me?.orchard_id || me.orchard_id !== orchard_id) {
                throw new AuthError('You can only check compliance in your own orchard', 403)
            }
        }

        // Tarifas del huerto (harvest_settings; la tabla orchards no tiene estas columnas)
        const { data: settings } = await supabase
            .from('harvest_settings')
            .select('piece_rate, min_wage_rate')
            .eq('orchard_id', orchard_id)
            .maybeSingle()

        const pieceRate = settings?.piece_rate || NZ_CONSTANTS.PIECE_RATE
        const minWage = Math.max(settings?.min_wage_rate || NZ_CONSTANTS.MINIMUM_WAGE, PAY_RULES.minWageFloor)

        // Hoy en hora NZ
        const today = nzDateOf(new Date())
        const isHoliday = isNZPublicHoliday(today)
        const nzOffset = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
            .formatToParts(new Date(`${today}T12:00:00Z`))
            .find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+13:00'

        // Fichajes, cubetas y precios con service role, después de requireRole y
        // del huerto: el manager y el TL solo leen los de su huerto (20261027050000,
        // 20261027070000), pero el día de la persona puede incluir otro huerto. No
        // salen en la respuesta: solo la parte de este huerto y los avisos del día.
        const rates = pieceRatesReader()

        // Tramos de hoy de estas personas en TODOS los huertos (pueden haber
        // pasado por otro huerto: el mínimo se comprueba con el día entero)
        const { data: attendance } = await rates
            .from('daily_attendance')
            .select('picker_id, orchard_id, check_in, check_out, break_start, break_minutes, date, corrected_at')
            .eq('date', today)
            .is('deleted_at', null)
            .in('picker_id', picker_ids)

        // Cubetas del día NZ (todos los huertos); los rechazos los quita el cálculo
        const { data: bucketCounts } = await rates
            .from('bucket_records')
            .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
            .is('deleted_at', null)
            .gte('scanned_at', `${today}T00:00:00${nzOffset}`)
            .lte('scanned_at', `${today}T23:59:59${nzOffset}`)
            .in('picker_id', picker_ids)

        // Precio de cada cubeta: el de hoy de su variedad en su huerto (piece_rates);
        // sin él, el general del huerto de hoy; si no, harvest_settings.piece_rate
        const [dailyRates, { data: settingsRows }] = await Promise.all([
            loadDailyPieceRates(rates, today, today),
            rates.from('harvest_settings').select('orchard_id, piece_rate'),
        ])
        const orchardRates: Record<string, number> = {}
        for (const s of (settingsRows ?? []) as { orchard_id: string; piece_rate: number | null }[]) {
            if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate)
        }

        type AttRow = { picker_id: string; orchard_id: string | null; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null; date: string; corrected_at: string | null }
        type BktRow = { picker_id: string; orchard_id: string | null; variety: string | null; scanned_at: string; quality_grade: string | null }
        // Manager y TL: solo quien ha trabajado hoy en su huerto (fichaje o cubeta
        // aquí); de los demás no se mira nada de otro huerto
        const workedHere = new Set<string>([
            ...((attendance ?? []) as AttRow[]).filter(a => a.orchard_id === orchard_id).map(a => a.picker_id),
            ...((bucketCounts ?? []) as BktRow[]).filter(b => b.orchard_id === orchard_id).map(b => b.picker_id),
        ])
        const visible = (pickerId: string) => !ownOrchardOnly || workedHere.has(pickerId)
        const attRows = ((attendance ?? []) as AttRow[]).filter(a => visible(a.picker_id))
        const bktRows = ((bucketCounts ?? []) as BktRow[]).filter(b => visible(b.picker_id))

        // Get picker names
        const { data: pickers } = await supabase
            .from('pickers')
            .select('id, name')
            .in('id', picker_ids)

        const pickerNames = new Map<string, string>()
        pickers?.forEach(p => pickerNames.set(p.id, p.name || 'Unknown'))

        // ── Compliance Analysis ──────────────────────
        const results: PickerCompliance[] = []
        const now = new Date()

        for (const pickerId of picker_ids) {
            const violations: ComplianceViolation[] = []
            const shifts = attRows.filter(a => a.picker_id === pickerId)
            const [range] = payForRange({
                // Igual que nómina (tope de 14 h salvo corrección posterior a la salida)
                attendance: shifts.map(a => ({ ...attendanceRowOf(a), pickerId, date: today })),
                buckets: bktRows.filter(b => b.picker_id === pickerId).map(b => ({
                    pickerId, scannedAt: b.scanned_at, qualityGrade: b.quality_grade, orchardId: b.orchard_id, variety: b.variety,
                    pieceRate: pieceRateOn(dailyRates, b.orchard_id, b.variety, nzDateOf(b.scanned_at), (b.orchard_id ? orchardRates[b.orchard_id] : undefined) ?? pieceRate),
                })),
                pieceRate,
                minWage,
                isPublicHoliday: () => isHoliday,
                now,
            })
            const wholeDay = range?.dayDetails[0]
            // Cifras de pago: las del día entero (admin) o la parte de este huerto
            const day = wholeDay && ownOrchardOnly ? orchardDayView(wholeDay, orchard_id) : wholeDay
            const buckets = day?.buckets ?? 0
            // Horas pagables (todos los tramos, trayecto, un descanso; o su parte aquí)
            const hoursWorked = day?.hours ?? 0
            // Tiempo en el día entero (bruto) para los avisos de descanso y de
            // exceso de horas: la ley mira el día de la persona, no el huerto
            const elapsedHours = (wholeDay?.segments ?? []).reduce((sum, s) => sum + s.grossHours + s.travelHours, 0)
            const mealBreakRecorded = shifts.some(a => !!a.break_start)
            const minWageApplied = isHoliday ? minWage * PAY_RULES.publicHolidayMultiplier : minWage
            const pay = {
                pieceHourlyRate: hoursWorked > 0 ? (day?.pieceEarnings ?? 0) / hoursWorked : 0,
                belowMinimum: day?.belowMinimum ?? false,
                topUp: day?.topUp ?? 0,
                minWageApplied: Math.round(minWageApplied * 100) / 100,
            }

            // 1. Rest break check (every 2 hours)
            if (elapsedHours > NZ_CONSTANTS.REST_BREAK_INTERVAL / 60) {
                violations.push({
                    type: 'break_overdue',
                    severity: 'medium',
                    message: `Rest break may be overdue. ${elapsedHours.toFixed(1)}h on shift — 10min break required every 2h.`,
                    details: {
                        hoursWorked: parseFloat(elapsedHours.toFixed(1)),
                        breakIntervalHours: NZ_CONSTANTS.REST_BREAK_INTERVAL / 60,
                    },
                })
            }

            // 2. Meal break check (every 4 hours) — solo si no se ha anotado el descanso
            if (elapsedHours > NZ_CONSTANTS.MEAL_BREAK_INTERVAL / 60 && !mealBreakRecorded) {
                violations.push({
                    type: 'break_overdue',
                    severity: 'high',
                    message: `Meal break not recorded. ${elapsedHours.toFixed(1)}h on shift — 30min break mandatory after 4h.`,
                    details: {
                        hoursWorked: parseFloat(elapsedHours.toFixed(1)),
                        mealBreakThresholdHours: NZ_CONSTANTS.MEAL_BREAK_INTERVAL / 60,
                    },
                })
            }

            // 3. Wage compliance
            const effectiveRate = pay.pieceHourlyRate
            const isBelowMinimum = pay.belowMinimum
            const topUpRequired = pay.topUp

            if (isBelowMinimum) {
                violations.push({
                    type: 'wage_below_minimum',
                    severity: 'high',
                    message: `Effective rate $${effectiveRate.toFixed(2)}/hr — below minimum wage $${pay.minWageApplied}/hr. Top-up: $${topUpRequired.toFixed(2)}.`,
                    details: {
                        effectiveRate: parseFloat(effectiveRate.toFixed(2)),
                        minimumWage: pay.minWageApplied,
                        topUpRequired: parseFloat(topUpRequired.toFixed(2)),
                        buckets,
                        pieceRate,
                    },
                })
            }

            // 4. Excessive hours
            if (elapsedHours > NZ_CONSTANTS.MAX_DAILY_HOURS) {
                violations.push({
                    type: 'excessive_hours',
                    severity: 'high',
                    message: `${elapsedHours.toFixed(1)}h on shift today — exceeds recommended maximum of ${NZ_CONSTANTS.MAX_DAILY_HOURS}h.`,
                    details: {
                        hoursWorked: parseFloat(elapsedHours.toFixed(1)),
                        maxRecommended: NZ_CONSTANTS.MAX_DAILY_HOURS,
                    },
                })
            }

            results.push({
                picker_id: pickerId,
                picker_name: pickerNames.get(pickerId) || 'Unknown',
                is_compliant: violations.length === 0,
                violations,
                metrics: {
                    hours_worked: parseFloat(hoursWorked.toFixed(2)),
                    buckets_today: buckets,
                    effective_hourly_rate: parseFloat(effectiveRate.toFixed(2)),
                    minimum_wage: pay.minWageApplied,
                    is_below_minimum: isBelowMinimum,
                    top_up_required: parseFloat(topUpRequired.toFixed(2)),
                },
            })
        }

        const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0)
        const workersWithViolations = results.filter(r => !r.is_compliant).length

        console.info(`[check-compliance] orchard=${orchard_id}, pickers=${picker_ids.length}, violations=${totalViolations}`)

        return jsonResponse({
            orchard_id,
            date: today,
            pickers: results,
            summary: {
                total_checked: picker_ids.length,
                compliant: picker_ids.length - workersWithViolations,
                with_violations: workersWithViolations,
                total_violations: totalViolations,
            },
        }, origin)

    } catch (error) {
        return errorResponse(error, origin, 'check-compliance')
    }
})
