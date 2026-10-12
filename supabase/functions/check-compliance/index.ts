import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    ComplianceCheckSchema,
} from '../_shared/security.ts'
import { payForRange, pieceRateFor, nzDateOf, isNZPublicHoliday, PAY_RULES } from '../_shared/pay-rules.ts'

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
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'team_leader'])
        checkRateLimit(user.id)

        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'check-compliance' }, origin)
        }

        const { orchard_id, picker_ids } = ComplianceCheckSchema.parse(body)

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

        // Tramos de hoy de estas personas en TODOS los huertos (pueden haber
        // pasado por otro huerto: el mínimo se comprueba con el día entero)
        const { data: attendance } = await supabase
            .from('daily_attendance')
            .select('picker_id, orchard_id, check_in, check_out, break_start, break_minutes, date')
            .eq('date', today)
            .is('deleted_at', null)
            .in('picker_id', picker_ids)

        // Cubetas del día NZ (todos los huertos); los rechazos los quita el cálculo
        const { data: bucketCounts } = await supabase
            .from('bucket_records')
            .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
            .is('deleted_at', null)
            .gte('scanned_at', `${today}T00:00:00${nzOffset}`)
            .lte('scanned_at', `${today}T23:59:59${nzOffset}`)
            .in('picker_id', picker_ids)

        // Precio de cada cubeta: variedad (huerto → empresa) o precio del huerto
        const [{ data: varietyRows }, { data: settingsRows }] = await Promise.all([
            supabase.from('variety_rates').select('orchard_id, variety, piece_rate'),
            supabase.from('harvest_settings').select('orchard_id, piece_rate'),
        ])
        const varietyRates = ((varietyRows ?? []) as { orchard_id: string | null; variety: string; piece_rate: number }[])
            .map(v => ({ orchardId: v.orchard_id, variety: v.variety, pieceRate: Number(v.piece_rate) }))
        const orchardRates: Record<string, number> = {}
        for (const s of (settingsRows ?? []) as { orchard_id: string; piece_rate: number | null }[]) {
            if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate)
        }

        type AttRow = { picker_id: string; orchard_id: string | null; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null; date: string }
        type BktRow = { picker_id: string; orchard_id: string | null; variety: string | null; scanned_at: string; quality_grade: string | null }
        const attRows = (attendance ?? []) as AttRow[]
        const bktRows = (bucketCounts ?? []) as BktRow[]

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
                attendance: shifts.map(a => ({
                    pickerId, date: today, orchardId: a.orchard_id,
                    checkIn: a.check_in, checkOut: a.check_out, breakStart: a.break_start, breakMinutes: a.break_minutes,
                })),
                buckets: bktRows.filter(b => b.picker_id === pickerId).map(b => ({
                    pickerId, scannedAt: b.scanned_at, qualityGrade: b.quality_grade, orchardId: b.orchard_id, variety: b.variety,
                    pieceRate: pieceRateFor({ orchardId: b.orchard_id, variety: b.variety }, { varietyRates, orchardRates, fallback: pieceRate }),
                })),
                pieceRate,
                minWage,
                isPublicHoliday: () => isHoliday,
                now,
            })
            const day = range?.dayDetails[0]
            const buckets = day?.buckets ?? 0
            // Horas pagables del día (todos los tramos, trayecto, un descanso)
            const hoursWorked = day?.hours ?? 0
            // Tiempo en el día (bruto) para los avisos de descanso y de exceso de horas
            const elapsedHours = (day?.segments ?? []).reduce((sum, s) => sum + s.grossHours + s.travelHours, 0)
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
