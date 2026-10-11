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
import { payForRange, nzDateOf, isNZPublicHoliday, PAY_RULES, type PickerRangePay } from '../_shared/pay-rules.ts'
import { fetchAllRows } from '../_shared/fetch-all-rows.ts'

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

// Festivos NZ (Holidays Act 2003 s.50): lista y fechas NZ del módulo compartido
const isPublicHoliday = isNZPublicHoliday

interface PickerBreakdown {
    picker_id: string
    picker_name: string
    buckets: number
    hours_worked: number
    hours_ordinary: number      // horas en días normales
    hours_holiday: number       // horas en public holidays (1.5x floor)
    piece_rate_earnings: number
    hourly_rate: number
    minimum_required: number    // incluye 1.5x sobre hours_holiday (informativo)
    top_up_required: number     // suma de complementos diarios
    total_earnings: number
    is_below_minimum: boolean   // algún día por debajo del mínimo
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
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'payroll_admin'])
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
            .select('piece_rate, min_wage_rate')
            .eq('orchard_id', orchard_id)
            .single()

        if (settingsError || !settings) {
            throw new Error(`Harvest settings not found for orchard ${orchard_id}: ${settingsError?.message}`)
        }

        const { piece_rate: bucket_rate, min_wage_rate: stored_min_wage } = settings

        // Floor legal: Minimum Wage Order 2026, efectivo 1 April 2026
        // Garantía defensiva — la migración 20260412 ya lo corrige en DB,
        // pero si la migración no se aplicó en algún entorno, esto evita sub-pagos ilegales.
        const NZ_MIN_WAGE_FLOOR = PAY_RULES.minWageFloor
        const min_wage_rate = Math.max(stored_min_wage, NZ_MIN_WAGE_FLOOR)

        if (stored_min_wage < NZ_MIN_WAGE_FLOOR) {
            console.warn(
                `[Payroll] COMPLIANCE WARNING: orchard ${orchard_id} has min_wage_rate=${stored_min_wage} < legal floor ${NZ_MIN_WAGE_FLOOR}. Using floor. Run migration 20260412_harvest_settings_min_wage_floor.sql.`
            )
        }

        console.info(`[Payroll] Settings - Bucket rate: $${bucket_rate}, Min wage: $${min_wage_rate}/hr`)

        // 2. Cubetas del rango (límites en hora NZ). Los rechazos de QC se
        //    excluyen dentro del cálculo (pay-rules.ts).
        // Por páginas: PostgREST corta en 1000 filas y una semana tiene más.
        const events = await fetchAllRows((from, to) => supabase
            .from('bucket_records')
            .select('picker_id, scanned_at, quality_grade')
            .eq('orchard_id', orchard_id)
            .is('deleted_at', null)
            .gte('scanned_at', toNZBoundary(start_date, '00:00:00'))
            .lte('scanned_at', toNZBoundary(end_date, '23:59:59'))
            .order('id')
            .range(from, to))

        // 2b. Fichajes del rango: entrada/salida y descanso que anota el team leader
        const attendance = await fetchAllRows((from, to) => supabase
            .from('daily_attendance')
            .select('picker_id, date, check_in, check_out, break_start, break_minutes')
            .eq('orchard_id', orchard_id)
            .is('deleted_at', null)
            .gte('date', start_date)
            .lte('date', end_date)
            .order('id')
            .range(from, to))

        // 3. Cálculo único (mismo código que la app, _shared/pay-rules.ts):
        //    - horas = salida − entrada − descanso de 30 min NO pagado
        //    - complemento al mínimo POR DÍA (un día bueno no tapa uno malo)
        //    - festivos (Holidays Act 2003 s.50): mínimo × 1.5 ese día
        type Att = { picker_id: string; date: string; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null }
        type Ev = { picker_id: string; scanned_at: string; quality_grade: string | null }
        const attRows = ((attendance ?? []) as Att[]).map(a => ({
            pickerId: a.picker_id,
            date: a.date.slice(0, 10),
            checkIn: a.check_in,
            checkOut: a.check_out,
            breakStart: a.break_start,
            breakMinutes: a.break_minutes,
        }))
        const bucketRows = ((events ?? []) as Ev[]).map(e => ({
            pickerId: e.picker_id,
            scannedAt: e.scanned_at,
            qualityGrade: e.quality_grade,
        }))

        // Días normales y festivos por separado para devolver horas de cada tipo
        // y los días alternativos (s.60). Como el cálculo es por día, sumar ambos
        // da exactamente el mismo total que calcularlos juntos.
        const holidayBucket = new Map(bucketRows.map(b => [b, isPublicHoliday(nzDateOf(b.scannedAt))]))
        const ordinary = payForRange({
            attendance: attRows.filter(a => !isPublicHoliday(a.date)),
            buckets: bucketRows.filter(b => !holidayBucket.get(b)),
            pieceRate: bucket_rate,
            minWage: min_wage_rate,
        })
        const holiday = payForRange({
            attendance: attRows.filter(a => isPublicHoliday(a.date)),
            buckets: bucketRows.filter(b => holidayBucket.get(b)),
            pieceRate: bucket_rate,
            minWage: min_wage_rate,
            isPublicHoliday: () => true,
        })
        const ordById = new Map(ordinary.map(r => [r.pickerId, r]))
        const holById = new Map(holiday.map(r => [r.pickerId, r]))
        const pickerIds = [...new Set([...ordById.keys(), ...holById.keys()])]

        const { data: names } = pickerIds.length
            ? await supabase.from('pickers').select('id, name').in('id', pickerIds)
            : { data: [] as { id: string; name: string }[] }
        const nameById = new Map((names ?? []).map((n: { id: string; name: string }) => [n.id, n.name]))

        // 4. Desglose por picker
        const picker_breakdown: PickerBreakdown[] = []
        let total_buckets = 0
        let total_hours = 0
        let total_piece_rate_earnings = 0
        let total_top_up = 0
        let total_alternative_holidays_owed = 0
        let workers_below_minimum = 0
        const zero: PickerRangePay = { pickerId: '', buckets: 0, hours: 0, pieceEarnings: 0, topUp: 0, total: 0, days: 0, daysBelowMinimum: 0, estimatedDays: 0 }
        const r2 = (n: number) => Math.round(n * 100) / 100

        for (const id of pickerIds) {
            const o = ordById.get(id) ?? zero
            const h = holById.get(id) ?? zero
            const hours_worked = r2(o.hours + h.hours)
            const buckets = o.buckets + h.buckets
            const piece_rate_earnings = r2(o.pieceEarnings + h.pieceEarnings)
            const top_up_required = r2(o.topUp + h.topUp)
            const total = r2(o.total + h.total)
            const is_below_minimum = o.daysBelowMinimum + h.daysBelowMinimum > 0
            if (is_below_minimum) workers_below_minimum++

            picker_breakdown.push({
                picker_id: id,
                picker_name: nameById.get(id) || 'Unknown',
                buckets,
                hours_worked,
                hours_ordinary: o.hours,
                hours_holiday: h.hours,
                piece_rate_earnings,
                hourly_rate: hours_worked > 0 ? r2(piece_rate_earnings / hours_worked) : 0,
                minimum_required: r2(o.hours * min_wage_rate + h.hours * min_wage_rate * PAY_RULES.publicHolidayMultiplier),
                top_up_required,
                total_earnings: total,
                is_below_minimum,
                // Holidays Act 2003 s.60: un día alternativo por festivo trabajado
                alternative_holidays_owed: h.days,
            })

            total_buckets += buckets
            total_hours += hours_worked
            total_piece_rate_earnings += piece_rate_earnings
            total_top_up += top_up_required
            total_alternative_holidays_owed += h.days
        }
        picker_breakdown.sort((a, b) => b.buckets - a.buckets)

        const total_earnings = total_piece_rate_earnings + total_top_up
        const workers_total = pickerIds.length
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
