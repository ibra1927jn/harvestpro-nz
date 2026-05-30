import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    ComplianceCheckSchema,
} from '../_shared/security.ts'

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
    PIECE_RATE: 6.50,          // NZD per bucket (default fallback — matches NZ_DEFAULT_PIECE_RATE in src/constants/nz-law.ts)
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

        // Get orchard settings for piece rate.
        // Read from harvest_settings (canonical), not from `orchards` — the
        // orchards table never had bucket_rate/min_wage_rate columns, so the
        // prior read always returned undefined and fell back to stale
        // NZ_CONSTANTS.PIECE_RATE (3.50 vs real 6.50), making the compliance
        // shield display wrong numbers.
        const { data: settings } = await supabase
            .from('harvest_settings')
            .select('piece_rate, min_wage_rate')
            .eq('orchard_id', orchard_id)
            .single()

        const pieceRate = settings?.piece_rate || NZ_CONSTANTS.PIECE_RATE
        const minWage = Math.max(settings?.min_wage_rate || 0, NZ_CONSTANTS.MINIMUM_WAGE)

        // Get today in NZST
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Pacific/Auckland',
        }).format(new Date())

        // Fetch attendance for all pickers today
        const { data: attendance } = await supabase
            .from('daily_attendance')
            .select('picker_id, check_in, check_out, date')
            .eq('orchard_id', orchard_id)
            .eq('date', today)
            .in('picker_id', picker_ids)

        // Fetch bucket counts for today
        const todayStart = `${today}T00:00:00`
        const todayEnd = `${today}T23:59:59`

        const { data: bucketCounts } = await supabase
            .from('bucket_records')
            .select('picker_id')
            .eq('orchard_id', orchard_id)
            .gte('scanned_at', todayStart)
            .lte('scanned_at', todayEnd)
            .in('picker_id', picker_ids)

        // Count buckets per picker
        const bucketsByPicker = new Map<string, number>()
        bucketCounts?.forEach(b => {
            bucketsByPicker.set(b.picker_id, (bucketsByPicker.get(b.picker_id) || 0) + 1)
        })

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
            const att = attendance?.find(a => a.picker_id === pickerId)
            const buckets = bucketsByPicker.get(pickerId) || 0

            let hoursWorked = 0
            if (att?.check_in) {
                const checkOut = att.check_out ? new Date(att.check_out) : now
                hoursWorked = Math.max(0, (checkOut.getTime() - new Date(att.check_in).getTime()) / 3_600_000)
            }

            // 1. Rest break check (every 2 hours)
            if (hoursWorked > NZ_CONSTANTS.REST_BREAK_INTERVAL / 60) {
                violations.push({
                    type: 'break_overdue',
                    severity: 'medium',
                    message: `Rest break may be overdue. ${hoursWorked.toFixed(1)}h worked — 10min break required every 2h.`,
                    details: {
                        hoursWorked: parseFloat(hoursWorked.toFixed(1)),
                        breakIntervalHours: NZ_CONSTANTS.REST_BREAK_INTERVAL / 60,
                    },
                })
            }

            // 2. Meal break check (every 4 hours)
            if (hoursWorked > NZ_CONSTANTS.MEAL_BREAK_INTERVAL / 60) {
                violations.push({
                    type: 'break_overdue',
                    severity: 'high',
                    message: `Meal break required. ${hoursWorked.toFixed(1)}h worked — 30min break mandatory after 4h.`,
                    details: {
                        hoursWorked: parseFloat(hoursWorked.toFixed(1)),
                        mealBreakThresholdHours: NZ_CONSTANTS.MEAL_BREAK_INTERVAL / 60,
                    },
                })
            }

            // 3. Wage compliance
            const pieceEarnings = buckets * pieceRate
            const effectiveRate = hoursWorked > 0 ? pieceEarnings / hoursWorked : 0
            const isBelowMinimum = hoursWorked > 0 && effectiveRate < minWage
            const topUpRequired = isBelowMinimum
                ? Math.max(0, (hoursWorked * minWage) - pieceEarnings)
                : 0

            if (isBelowMinimum) {
                violations.push({
                    type: 'wage_below_minimum',
                    severity: 'high',
                    message: `Effective rate $${effectiveRate.toFixed(2)}/hr — below minimum wage $${minWage}/hr. Top-up: $${topUpRequired.toFixed(2)}.`,
                    details: {
                        effectiveRate: parseFloat(effectiveRate.toFixed(2)),
                        minimumWage: minWage,
                        topUpRequired: parseFloat(topUpRequired.toFixed(2)),
                        buckets,
                        pieceRate,
                    },
                })
            }

            // 4. Excessive hours
            if (hoursWorked > NZ_CONSTANTS.MAX_DAILY_HOURS) {
                violations.push({
                    type: 'excessive_hours',
                    severity: 'high',
                    message: `${hoursWorked.toFixed(1)}h worked today — exceeds recommended maximum of ${NZ_CONSTANTS.MAX_DAILY_HOURS}h.`,
                    details: {
                        hoursWorked: parseFloat(hoursWorked.toFixed(1)),
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
                    minimum_wage: minWage,
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
