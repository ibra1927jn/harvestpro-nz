/**
 * Cálculo de la nómina (empresa o un huerto) para un rango de días.
 * Lo usan calculate-payroll (pantalla de Nómina, RRHH, informes) y
 * close-pay-week (foto de lo que se paga al cerrar la semana), así ambos dan
 * exactamente las mismas cifras.
 */
import { payForRange, pieceRateFor, isNZPublicHoliday, PAY_RULES, type PayDay } from './pay-rules.ts'
import { fetchAllRows } from './fetch-all-rows.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

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

export interface PickerBreakdown {
    picker_id: string
    picker_name: string
    buckets: number
    hours_worked: number
    hours_ordinary: number      // horas en días normales
    hours_holiday: number       // horas en public holidays (1.5x floor)
    piece_rate_earnings: number
    // Festivo: media parte extra de lo ganado por cubetas (Holidays Act s.50)
    holiday_premium: number
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
    // Días con horas estimadas (turno sin cerrar): revisar antes de pagar
    estimated_days: number
    // Detalle día a día: huerto y horas de cada tramo, cubetas por variedad, pago
    days: PayDay[]
}

export interface PayrollResult {
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
        total_estimated_days: number
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

export async function computePayroll(
    supabase: SupabaseLike,
    { orchard_id, start_date, end_date }: { orchard_id?: string; start_date: string; end_date: string },
): Promise<PayrollResult> {
    // 1. Tarifas. Cada cubeta cobra el precio de su variedad (en su huerto o,
    //    si no, el de la empresa); si la variedad no tiene precio, el precio
    //    normal del huerto (harvest_settings.piece_rate).
    const { data: settingsRows, error: settingsError } = await supabase
        .from('harvest_settings')
        .select('orchard_id, piece_rate, min_wage_rate')
    if (settingsError) throw new Error(`Harvest settings: ${settingsError.message}`)
    const settingsList = (settingsRows ?? []) as { orchard_id: string; piece_rate: number | null; min_wage_rate: number | null }[]
    const own = orchard_id ? settingsList.find(s => s.orchard_id === orchard_id) : undefined
    if (orchard_id && !own) throw new Error(`Harvest settings not found for orchard ${orchard_id}`)

    const orchardRates: Record<string, number> = {}
    for (const s of settingsList) if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate)
    const bucket_rate = own?.piece_rate != null ? Number(own.piece_rate) : (settingsList.find(s => s.piece_rate != null)?.piece_rate ?? 6.5)

    // Mínimo: el del huerto, o el más alto de la empresa; nunca por debajo del legal
    // (Minimum Wage Order 2026; la migración 20260412 ya lo corrige en DB).
    const stored_min_wage = own?.min_wage_rate != null
        ? Number(own.min_wage_rate)
        : Math.max(PAY_RULES.minWageFloor, ...settingsList.map(s => Number(s.min_wage_rate ?? 0)))
    const min_wage_rate = Math.max(stored_min_wage, PAY_RULES.minWageFloor)
    if (stored_min_wage < PAY_RULES.minWageFloor) {
        console.warn(`[Payroll] COMPLIANCE WARNING: min_wage_rate=${stored_min_wage} < legal floor ${PAY_RULES.minWageFloor}. Using floor.`)
    }

    const { data: varietyRows } = await supabase
        .from('variety_rates')
        .select('orchard_id, variety, piece_rate')
    const varietyRates = ((varietyRows ?? []) as { orchard_id: string | null; variety: string; piece_rate: number }[])
        .map(v => ({ orchardId: v.orchard_id, variety: v.variety, pieceRate: Number(v.piece_rate) }))

    // 2. Cubetas y tramos del rango (límites en hora NZ), de TODOS los huertos
    //    salvo que se pida uno. La gente rota y puede pasar de un huerto a otro
    //    el mismo día: el complemento al mínimo se calcula con el día entero.
    //    Por páginas: PostgREST corta en 1000 filas y una semana tiene más.
    const events = await fetchAllRows((from, to) => {
        let q = supabase
            .from('bucket_records')
            .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
            .is('deleted_at', null)
            .gte('scanned_at', toNZBoundary(start_date, '00:00:00'))
            .lte('scanned_at', toNZBoundary(end_date, '23:59:59'))
        if (orchard_id) q = q.eq('orchard_id', orchard_id)
        return q.order('id').range(from, to)
    })
    const attendance = await fetchAllRows((from, to) => {
        let q = supabase
            .from('daily_attendance')
            .select('picker_id, orchard_id, date, check_in, check_out, break_start, break_minutes')
            .is('deleted_at', null)
            .gte('date', start_date)
            .lte('date', end_date)
        if (orchard_id) q = q.eq('orchard_id', orchard_id)
        return q.order('id').range(from, to)
    })

    // 3. Cálculo único (mismo código que la app, _shared/pay-rules.ts):
    //    - horas del día = suma de tramos − un descanso de 30 min NO pagado
    //    - complemento al mínimo POR DÍA (un día bueno no tapa uno malo)
    //    - festivos (Holidays Act 2003 s.50): mínimo × 1.5 ese día
    type Att = { picker_id: string; orchard_id: string | null; date: string; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null }
    type Ev = { picker_id: string; orchard_id: string | null; variety: string | null; scanned_at: string; quality_grade: string | null }
    const attRows = ((attendance ?? []) as Att[]).map(a => ({
        pickerId: a.picker_id,
        orchardId: a.orchard_id,
        date: a.date.slice(0, 10),
        checkIn: a.check_in,
        checkOut: a.check_out,
        breakStart: a.break_start,
        breakMinutes: a.break_minutes,
    }))
    const bucketRows = ((events ?? []) as Ev[]).map(e => ({
        pickerId: e.picker_id,
        orchardId: e.orchard_id,
        variety: e.variety,
        scannedAt: e.scanned_at,
        qualityGrade: e.quality_grade,
        pieceRate: pieceRateFor({ orchardId: e.orchard_id, variety: e.variety }, { varietyRates, orchardRates, fallback: bucket_rate }),
    }))

    // Tarifa por hora del contrato: si es mayor que el mínimo, es el mínimo
    // garantizado de esa persona (nadie cobra menos de lo firmado).
    const { data: contractRows } = await supabase
        .from('contracts')
        .select('employee_id, hourly_rate, start_date, end_date, status')
        .in('status', ['active', 'expiring'])
    const minWageById = new Map<string, number>()
    for (const k of (contractRows ?? []) as { employee_id: string; hourly_rate: number | null; start_date: string | null; end_date: string | null }[]) {
        const rate = Number(k.hourly_rate ?? 0)
        const covers = (!k.start_date || k.start_date <= end_date) && (!k.end_date || k.end_date >= start_date)
        if (covers && rate > min_wage_rate) minWageById.set(k.employee_id, Math.max(rate, minWageById.get(k.employee_id) ?? 0))
    }
    const minWageOf = (id: string) => minWageById.get(id) ?? min_wage_rate

    // Un cálculo por cada mínimo distinto (casi todos usan el general)
    const groups = new Map<number, Set<string>>()
    for (const id of new Set([...attRows.map(a => a.pickerId), ...bucketRows.map(b => b.pickerId)])) {
        const w = minWageOf(id)
        const set = groups.get(w) ?? new Set<string>()
        set.add(id)
        groups.set(w, set)
    }
    const rows = [...groups.entries()].flatMap(([minWage, ids]) => payForRange({
        attendance: attRows.filter(a => ids.has(a.pickerId)),
        buckets: bucketRows.filter(b => ids.has(b.pickerId)),
        pieceRate: bucket_rate,
        minWage,
        isPublicHoliday,
    })).sort((a, b) => b.buckets - a.buckets)
    const pickerIds = rows.map(r => r.pickerId)

    const { data: names } = pickerIds.length
        ? await supabase.from('pickers').select('id, name').in('id', pickerIds)
        : { data: [] as { id: string; name: string }[] }
    const nameById = new Map<string, string>((names ?? []).map((n: { id: string; name: string }) => [n.id, n.name]))

    // 4. Desglose por picker
    const picker_breakdown: PickerBreakdown[] = []
    let total_buckets = 0
    let total_hours = 0
    let total_piece_rate_earnings = 0
    let total_top_up = 0
    let total_alternative_holidays_owed = 0
    let workers_below_minimum = 0
    const r2 = (n: number) => Math.round(n * 100) / 100

    for (const r of rows) {
        const holidayDays = r.dayDetails.filter(d => d.isPublicHoliday)
        const hours_holiday = r2(holidayDays.reduce((s, d) => s + d.hours, 0))
        const hours_ordinary = r2(r.hours - hours_holiday)
        const is_below_minimum = r.daysBelowMinimum > 0
        if (is_below_minimum) workers_below_minimum++

        picker_breakdown.push({
            picker_id: r.pickerId,
            picker_name: nameById.get(r.pickerId) || 'Unknown',
            buckets: r.buckets,
            hours_worked: r.hours,
            hours_ordinary,
            hours_holiday,
            piece_rate_earnings: r.pieceEarnings,
            holiday_premium: r.holidayPremium,
            hourly_rate: r.hours > 0 ? r2(r.pieceEarnings / r.hours) : 0,
            minimum_required: r2(hours_ordinary * minWageOf(r.pickerId) + hours_holiday * minWageOf(r.pickerId) * PAY_RULES.publicHolidayMultiplier),
            top_up_required: r.topUp,
            total_earnings: r.total,
            is_below_minimum,
            // Holidays Act 2003 s.60: un día alternativo por festivo trabajado
            alternative_holidays_owed: holidayDays.length,
            estimated_days: r.estimatedDays,
            days: r.dayDetails,
        })

        total_buckets += r.buckets
        total_hours += r.hours
        total_piece_rate_earnings += r.pieceEarnings
        total_top_up += r.topUp
        total_alternative_holidays_owed += holidayDays.length
    }
    picker_breakdown.sort((a, b) => b.buckets - a.buckets)

    // Suma de los totales por picker (misma cifra que HR y el informe, sin descuadres de céntimos)
    const total_earnings = picker_breakdown.reduce((s, p) => s + p.total_earnings, 0)
    const workers_total = pickerIds.length
    const compliance_rate = workers_total > 0
        ? ((workers_total - workers_below_minimum) / workers_total) * 100
        : 100

    const result: PayrollResult = {
        // 'company' = todos los huertos de la empresa
        orchard_id: orchard_id ?? 'company',
        date_range: { start: start_date, end: end_date },
        summary: {
            total_buckets,
            total_hours: parseFloat(total_hours.toFixed(2)),
            total_piece_rate_earnings: parseFloat(total_piece_rate_earnings.toFixed(2)),
            total_top_up: parseFloat(total_top_up.toFixed(2)),
            total_earnings: parseFloat(total_earnings.toFixed(2)),
            total_alternative_holidays_owed,
            total_estimated_days: picker_breakdown.reduce((s, p) => s + p.estimated_days, 0),
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
    return result
}
