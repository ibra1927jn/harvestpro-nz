import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    corsHeaders,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    PayrollInputSchema,
} from '../_shared/security.ts'

// FIX U3: Dynamic NZST offset — handles DST transitions correctly
function getNZOffset(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    const fmt = new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        timeZoneName: 'longOffset'
    });
    const parts = fmt.formatToParts(d);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const offset = tzPart?.value?.replace('GMT', '') || '+13:00';
    return offset;
}

function toNZBoundary(dateStr: string, time: string): string {
    return `${dateStr}T${time}${getNZOffset(dateStr)}`;
}

// NZ Public Holidays — Holidays Act 2003 s.50 requires time-and-a-half
// for hours worked on a public holiday. Lista debe mantenerse en sync
// con src/constants/nz-law.ts (NO shared import posible: src/ es TS web,
// functions/ es Deno edge. Mantenimiento anual junto con nz-law.ts).
const NZ_PUBLIC_HOLIDAY_RATE = 1.5;
const NZ_PUBLIC_HOLIDAYS_SET = new Set<string>([
    // 2026 (Monday-ised)
    '2026-01-01', '2026-01-02', '2026-02-06', '2026-04-03', '2026-04-06',
    '2026-04-27', '2026-06-01', '2026-07-10', '2026-10-26', '2026-12-25',
    '2026-12-28',
    // 2027 (Monday-ised)
    '2027-01-01', '2027-01-04', '2027-02-08', '2027-03-26', '2027-03-29',
    '2027-04-26', '2027-06-07', '2027-06-25', '2027-10-25', '2027-12-27',
    '2027-12-28',
]);

function isPublicHoliday(dateStr: string): boolean {
    return NZ_PUBLIC_HOLIDAYS_SET.has(dateStr.slice(0, 10));
}

interface PickerBreakdown {
    picker_id: string
    picker_name: string
    buckets: number
    hours_worked: number
    hours_ordinary: number      // horas en días normales
    hours_holiday: number       // horas en public holidays (1.5x floor)
    piece_rate_earnings: number
    hourly_rate: number
    minimum_required: number    // ya incluye premium 1.5x sobre hours_holiday
    top_up_required: number
    total_earnings: number
    is_below_minimum: boolean
    // Holidays Act 2003 s.60: día alternativo en lieu por cada public holiday
    // trabajado que habría sido un día hábil para el picker. Simplificación
    // MVP: contamos fechas únicas con horas > 0; el flag "otherwise working
    // day" lo asumimos true para pickers estacionales.
    alternative_holidays_owed: number
}

interface PayrollResult {
    orchard_id: string
    date_range: {
        start: string
        end: string
    }
    summary: {
        total_buckets: number
        total_hours: number
        total_piece_rate_earnings: number
        total_top_up: number
        total_earnings: number
        // Suma de alternative_holidays_owed across pickers (Holidays Act s.60).
        total_alternative_holidays_owed: number
    }
    compliance: {
        workers_below_minimum: number
        workers_total: number
        compliance_rate: number
    }
    picker_breakdown: PickerBreakdown[]
    settings: {
        bucket_rate: number
        min_wage_rate: number   // effective rate (may be floored to legal minimum)
        stored_min_wage: number // raw value from harvest_settings
    }
}

serve(async (req) => {
    // ── CORS Preflight ───────────────────────────────
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth + RBAC ──────────────────────────────
        const { user, supabase } = await requireRole(req, ['admin', 'manager'])
        checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 }) // Payroll is sensitive — low limit

        // ── Input Validation ─────────────────────────
        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'calculate-payroll' }, origin)
        }

        const { orchard_id, start_date, end_date } = PayrollInputSchema.parse(body)

        console.info(`[Payroll] Calculating for orchard ${orchard_id} from ${start_date} to ${end_date}`)

        // 1. Obtener configuración del orchard desde harvest_settings
        // Nota: bucket_rate = piece_rate en harvest_settings (mismo concepto, nombre legacy en código)
        const { data: settings, error: settingsError } = await supabase
            .from('harvest_settings')
            .select('piece_rate, min_wage_rate, meal_break_paid')
            .eq('orchard_id', orchard_id)
            .single()

        if (settingsError || !settings) {
            throw new Error(`Harvest settings not found for orchard ${orchard_id}: ${settingsError?.message}`)
        }

        const { piece_rate: bucket_rate, min_wage_rate: stored_min_wage } = settings
        // Wages Protection Act 1983 s.5: do not deduct unless configured false.
        // Default true (paid break) when column is missing/null in pre-migration envs.
        const meal_break_paid = settings.meal_break_paid !== false

        // Floor legal: Minimum Wage Order 2026, efectivo 1 April 2026
        // Garantía defensiva — la migración 20260412 ya lo corrige en DB,
        // pero si la migración no se aplicó en algún entorno, esto evita sub-pagos ilegales.
        const NZ_MIN_WAGE_FLOOR = 23.95
        const min_wage_rate = Math.max(stored_min_wage, NZ_MIN_WAGE_FLOOR)

        if (stored_min_wage < NZ_MIN_WAGE_FLOOR) {
            console.warn(
                `[Payroll] COMPLIANCE WARNING: orchard ${orchard_id} has min_wage_rate=${stored_min_wage} < legal floor ${NZ_MIN_WAGE_FLOOR}. Using floor. Run migration 20260412_harvest_settings_min_wage_floor.sql.`
            )
        }

        console.info(`[Payroll] Settings - Bucket rate: $${bucket_rate}, Min wage: $${min_wage_rate}/hr`)

        // 2. Obtener bucket_records del rango (NZST boundaries)
        // Excluir grade='reject' — buckets rechazados por QC no cuentan para piece-rate
        const { data: events, error: eventsError } = await supabase
            .from('bucket_records')
            .select('picker_id, scanned_at, quality_grade, pickers:picker_id(name)')
            .eq('orchard_id', orchard_id)
            .is('deleted_at', null)
            .neq('quality_grade', 'reject')
            .gte('scanned_at', toNZBoundary(start_date, '00:00:00'))
            .lte('scanned_at', toNZBoundary(end_date, '23:59:59'))

        if (eventsError) {
            throw new Error(`Failed to fetch bucket records: ${eventsError.message}`)
        }

        console.info(`[Payroll] Found ${events?.length || 0} bucket records (rejected excluded)`)

        // 2b. Fetch attendance records for actual hours (ALL days in range)
        const { data: attendance } = await supabase
            .from('daily_attendance')
            .select('picker_id, date, check_in, check_out')
            .eq('orchard_id', orchard_id)
            .gte('date', start_date)
            .lte('date', end_date)

        // Employment Relations Act 2000 s.69ZD: 30-min meal break for shifts > 4h.
        // Whether that break is paid or unpaid is set by the IEA; config in
        // harvest_settings.meal_break_paid (default true per Wages Protection Act
        // 1983 s.5 — no deduction without written consent).
        const MEAL_BREAK_HOURS = 0.5
        const MEAL_BREAK_THRESHOLD = 4 // hours

        // Build attendance map: picker_id -> { ordinary, holiday } hours.
        // Split permite aplicar time-and-a-half (1.5x) a hours trabajadas en
        // public holidays según Holidays Act 2003 s.50. También guardamos
        // el set de fechas de public holiday trabajadas para s.60 (alt day).
        const attendanceHoursMap = new Map<
            string,
            { ordinary: number; holiday: number; altDates: Set<string> }
        >()
        attendance?.forEach((a: { picker_id: string; date: string; check_in: string | null; check_out: string | null }) => {
            if (a.check_in) {
                const checkIn = new Date(a.check_in)
                const checkOut = a.check_out ? new Date(a.check_out) : null

                if (checkOut) {
                    const rawDayHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)
                    const dayHours = !meal_break_paid && rawDayHours > MEAL_BREAK_THRESHOLD
                        ? rawDayHours - MEAL_BREAK_HOURS
                        : rawDayHours
                    const prev = attendanceHoursMap.get(a.picker_id) || {
                        ordinary: 0,
                        holiday: 0,
                        altDates: new Set<string>(),
                    }
                    const clamped = Math.max(0, dayHours)
                    if (isPublicHoliday(a.date)) {
                        prev.holiday += clamped
                        if (clamped > 0) prev.altDates.add(a.date.slice(0, 10))
                    } else {
                        prev.ordinary += clamped
                    }
                    attendanceHoursMap.set(a.picker_id, prev)
                }
            }
        })

        // 3. Agrupar por picker y calcular stats
        const pickerStatsMap = new Map<string, {
            picker_id: string
            picker_name: string
            buckets: number
            first_scan: Date
            last_scan: Date
        }>()

        events?.forEach(event => {
            const pickerId = event.picker_id
            const scanTime = new Date(event.scanned_at)
            const pickerName = (event.pickers as { name: string } | null)?.name || 'Unknown'

            const existing = pickerStatsMap.get(pickerId)

            if (!existing) {
                pickerStatsMap.set(pickerId, {
                    picker_id: pickerId,
                    picker_name: pickerName,
                    buckets: 1,
                    first_scan: scanTime,
                    last_scan: scanTime
                })
            } else {
                existing.buckets++
                if (scanTime < existing.first_scan) existing.first_scan = scanTime
                if (scanTime > existing.last_scan) existing.last_scan = scanTime
            }
        })

        // 4. Calcular earnings y compliance
        const picker_breakdown: PickerBreakdown[] = []
        let total_buckets = 0
        let total_hours = 0
        let total_piece_rate_earnings = 0
        let total_top_up = 0
        let total_alternative_holidays_owed = 0
        let workers_below_minimum = 0

        for (const [/* key */, stats] of pickerStatsMap) {
            let hours_ordinary: number
            let hours_holiday: number
            let alternative_holidays_owed: number
            const attendanceSplit = attendanceHoursMap.get(stats.picker_id)

            if (attendanceSplit && (attendanceSplit.ordinary > 0 || attendanceSplit.holiday > 0)) {
                hours_ordinary = attendanceSplit.ordinary
                hours_holiday = attendanceSplit.holiday
                alternative_holidays_owed = attendanceSplit.altDates.size
            } else {
                // Fallback por scan time — no hay forma robusta de split
                // ordinary/holiday sin attendance records. Aplicamos al día del
                // first_scan: si cae en public holiday, todas las horas son holiday.
                const raw_hours = (stats.last_scan.getTime() - stats.first_scan.getTime()) / (1000 * 60 * 60)
                const fallback_hours = raw_hours > MEAL_BREAK_THRESHOLD
                    ? raw_hours - MEAL_BREAK_HOURS
                    : raw_hours
                const scanDateNZ = stats.first_scan.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
                if (isPublicHoliday(scanDateNZ)) {
                    hours_ordinary = 0
                    hours_holiday = Math.max(0, fallback_hours)
                    alternative_holidays_owed = fallback_hours > 0 ? 1 : 0
                } else {
                    hours_ordinary = Math.max(0, fallback_hours)
                    hours_holiday = 0
                    alternative_holidays_owed = 0
                }
            }

            const hours_worked = hours_ordinary + hours_holiday
            const piece_rate_earnings = stats.buckets * bucket_rate
            const hourly_rate = hours_worked > 0 ? piece_rate_earnings / hours_worked : 0
            // Holidays Act 2003 s.50: time-and-a-half para hours trabajadas en public holiday.
            const minimum_required =
                hours_ordinary * min_wage_rate +
                hours_holiday * min_wage_rate * NZ_PUBLIC_HOLIDAY_RATE
            const top_up_required = Math.max(0, minimum_required - piece_rate_earnings)
            const total_earnings = piece_rate_earnings + top_up_required
            // Effective floor según composición (ponderada por horas).
            const effective_floor = hours_worked > 0 ? minimum_required / hours_worked : min_wage_rate
            const is_below_minimum = hourly_rate < effective_floor && hours_worked > 0

            if (is_below_minimum) {
                workers_below_minimum++
            }

            picker_breakdown.push({
                picker_id: stats.picker_id,
                picker_name: stats.picker_name,
                buckets: stats.buckets,
                hours_worked: parseFloat(hours_worked.toFixed(2)),
                hours_ordinary: parseFloat(hours_ordinary.toFixed(2)),
                hours_holiday: parseFloat(hours_holiday.toFixed(2)),
                piece_rate_earnings: parseFloat(piece_rate_earnings.toFixed(2)),
                hourly_rate: parseFloat(hourly_rate.toFixed(2)),
                minimum_required: parseFloat(minimum_required.toFixed(2)),
                top_up_required: parseFloat(top_up_required.toFixed(2)),
                total_earnings: parseFloat(total_earnings.toFixed(2)),
                is_below_minimum,
                alternative_holidays_owed
            })

            total_buckets += stats.buckets
            total_hours += hours_worked
            total_piece_rate_earnings += piece_rate_earnings
            total_top_up += top_up_required
            total_alternative_holidays_owed += alternative_holidays_owed
        }

        const total_earnings = total_piece_rate_earnings + total_top_up
        const workers_total = pickerStatsMap.size
        const compliance_rate = workers_total > 0
            ? ((workers_total - workers_below_minimum) / workers_total) * 100
            : 100

        const result: PayrollResult = {
            orchard_id,
            date_range: { start: start_date, end: end_date },
            summary: {
                total_buckets,
                total_hours: parseFloat(total_hours.toFixed(2)),
                total_piece_rate_earnings: parseFloat(total_piece_rate_earnings.toFixed(2)),
                total_top_up: parseFloat(total_top_up.toFixed(2)),
                total_earnings: parseFloat(total_earnings.toFixed(2)),
                total_alternative_holidays_owed
            },
            compliance: {
                workers_below_minimum,
                workers_total,
                compliance_rate: parseFloat(compliance_rate.toFixed(2))
            },
            picker_breakdown,
            settings: { bucket_rate, min_wage_rate, stored_min_wage }
        }

        console.info(`[Payroll] Complete - Total: $${total_earnings}, Top-up: $${total_top_up}`)

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return errorResponse(error, origin, 'Payroll')
    }
})
