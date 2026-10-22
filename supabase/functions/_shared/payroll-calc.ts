/**
 * Cálculo de la nómina (empresa o un huerto) para un rango de días.
 * Lo usan calculate-payroll (pantalla de Nómina, RRHH, informes) y
 * close-pay-week (foto de lo que se paga al cerrar la semana), así ambos dan
 * exactamente las mismas cifras.
 */
import { payForRange, pieceRateOn, nzDateOf, isNZPublicHoliday, PAY_RULES, type PayDay, type PickerRangePay } from './pay-rules.ts'
import { loadDailyPieceRates } from './piece-rates.ts'
import { fetchAllRows } from './fetch-all-rows.ts'
import { fetchInChunks } from './fetch-in-chunks.ts'

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

function addDays(dateYMD: string, n: number): string {
    const d = new Date(`${dateYMD}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

const cents = (n: number) => Math.round(n * 100)

/**
 * Deja solo los días del rango y rehace los totales de cada persona. Se leen
 * un día más por cada lado para los turnos que cruzan la medianoche (las
 * cubetas de después de las 00:00 son del día del turno): el domingo por la
 * noche sigue en su semana y el lunes de madrugada de la semana anterior no.
 */
function restrictToRange(rows: PickerRangePay[], start: string, end: string): PickerRangePay[] {
    const out: PickerRangePay[] = []
    for (const r of rows) {
        const days = r.dayDetails.filter(d => d.date >= start && d.date <= end)
        if (days.length === 0) continue
        const sum = (f: (d: PayDay) => number) => days.reduce((s, d) => s + cents(f(d)), 0) / 100
        out.push({
            ...r,
            dayDetails: days,
            buckets: days.reduce((s, d) => s + d.buckets, 0),
            hours: sum(d => d.hours),
            pieceEarnings: sum(d => d.pieceEarnings),
            holidayPremium: sum(d => d.holidayPremium),
            topUp: sum(d => d.topUp),
            total: sum(d => d.total),
            days: days.length,
            daysBelowMinimum: days.filter(d => d.belowMinimum).length,
            estimatedDays: days.filter(d => d.estimated).length,
        })
    }
    return out
}

// Festivos NZ (Holidays Act 2003 s.50): lista y fechas NZ del módulo compartido
const isPublicHoliday = isNZPublicHoliday

/**
 * La parte de un huerto de la nómina de cada persona: suma de su reparto por
 * huerto (byOrchard) de cada día. El detalle del día (days) se deja entero.
 */
function onlyOrchardShare(rows: PickerRangePay[], orchardId: string): PickerRangePay[] {
    const out: PickerRangePay[] = []
    for (const r of rows) {
        const days = r.dayDetails.filter(d => d.byOrchard.some(o => o.orchardId === orchardId) || d.segments.some(s => s.orchardId === orchardId))
        if (days.length === 0) continue
        const shares = days.map(d => d.byOrchard.find(o => o.orchardId === orchardId))
        const sum = (f: (o: NonNullable<(typeof shares)[number]>) => number) => shares.reduce((s, o) => s + (o ? cents(f(o)) : 0), 0) / 100
        out.push({
            ...r,
            dayDetails: days,
            buckets: shares.reduce((s, o) => s + (o?.buckets ?? 0), 0),
            hours: sum(o => o.hours),
            pieceEarnings: sum(o => o.pieceEarnings),
            holidayPremium: sum(o => o.holidayPremium),
            topUp: sum(o => o.topUp),
            total: sum(o => o.total),
            days: days.length,
            daysBelowMinimum: days.filter(d => d.belowMinimum).length,
            estimatedDays: days.filter(d => d.estimated).length,
        })
    }
    return out
}

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
    // 1. Tarifas. Cada cubeta cobra el precio de SU DÍA para su variedad en su
    //    huerto; si la variedad no tiene precio, el general del huerto ese día;
    //    si el huerto no tiene ninguno, harvest_settings.piece_rate.
    const { data: settingsRows, error: settingsError } = await supabase
        .from('harvest_settings')
        .select('orchard_id, piece_rate, min_wage_rate')
    if (settingsError) throw new Error(`Harvest settings: ${settingsError.message}`)
    const settingsList = (settingsRows ?? []) as { orchard_id: string; piece_rate: number | null; min_wage_rate: number | null }[]
    const own = orchard_id ? settingsList.find(s => s.orchard_id === orchard_id) : undefined
    if (orchard_id && !own) throw new Error(`Harvest settings not found for orchard ${orchard_id}`)

    const orchardRates: Record<string, number> = {}
    for (const s of settingsList) if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate)
    // El cálculo es SIEMPRE el de la empresa (mismas tarifas y mínimo), también
    // cuando se pide un huerto: así lo que ve el manager de un huerto es
    // exactamente su parte de la nómina (coste por huerto), no otro cálculo.
    const companyBucketRate = Number(settingsList.find(s => s.piece_rate != null)?.piece_rate ?? 6.5)
    const bucket_rate = own?.piece_rate != null ? Number(own.piece_rate) : companyBucketRate

    // Mínimo: el más alto de la empresa; nunca por debajo del legal
    // (Minimum Wage Order 2026; la migración 20260412 ya lo corrige en DB).
    const companyMinWage = Math.max(PAY_RULES.minWageFloor, ...settingsList.map(s => Number(s.min_wage_rate ?? 0)))
    const stored_min_wage = own?.min_wage_rate != null ? Number(own.min_wage_rate) : companyMinWage
    const min_wage_rate = Math.max(companyMinWage, PAY_RULES.minWageFloor)
    if (stored_min_wage < PAY_RULES.minWageFloor) {
        console.warn(`[Payroll] COMPLIANCE WARNING: min_wage_rate=${stored_min_wage} < legal floor ${PAY_RULES.minWageFloor}. Using floor.`)
    }

    // Precio por cubeta de cada día, huerto y variedad (piece_rates): cambiar el
    // precio hoy no reescribe los días anteriores. Hasta el día siguiente al
    // rango (cubetas de un turno que cruza la medianoche).
    const dailyRates = await loadDailyPieceRates(supabase, start_date, addDays(end_date, 1))

    // 2. Cubetas y tramos del rango (límites en hora NZ), de TODOS los huertos
    //    (también si se pide uno). La gente rota y puede pasar de un huerto a
    //    otro el mismo día: el complemento al mínimo se calcula con el día entero.
    //    Por páginas: PostgREST corta en 1000 filas y una semana tiene más.
    const events = await fetchAllRows((from, to) => {
        const q = supabase
            .from('bucket_records')
            .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
            .is('deleted_at', null)
            .gte('scanned_at', toNZBoundary(start_date, '00:00:00'))
            // Hasta el final del día siguiente al rango (turno que cruza la medianoche)
            .lt('scanned_at', toNZBoundary(addDays(end_date, 2), '00:00:00'))
        // Orden por (scanned_at, id): el índice de scanned_at ya da el orden y cada
        // página no reordena la semana entera (con order('id') cada página
        // ordenaba ~70.000 filas en disco: 150 ms × 70 páginas; ahora ~45 ms)
        return q.order('scanned_at').order('id').range(from, to)
    })
    const attendance = await fetchAllRows((from, to) => {
        const q = supabase
            .from('daily_attendance')
            .select('picker_id, orchard_id, date, check_in, check_out, break_start, break_minutes')
            .is('deleted_at', null)
            // Un día más por cada lado: las cubetas de después de medianoche son
            // del turno que las cubre (que puede ser del día anterior o del siguiente)
            .gte('date', addDays(start_date, -1))
            .lte('date', addDays(end_date, 1))
        return q.order('id').range(from, to)
    })

    // 3. Cálculo único (mismo código que la app, _shared/pay-rules.ts):
    //    - horas del día = suma de tramos − un descanso de 30 min NO pagado
    //    - complemento al mínimo POR DÍA (un día bueno no tapa uno malo)
    //    - festivos (Holidays Act 2003 s.50): mínimo × 1.5 ese día
    type Att = { picker_id: string; orchard_id: string | null; date: string; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null }
    type Ev = { picker_id: string; orchard_id: string | null; variety: string | null; scanned_at: string; quality_grade: string | null }
    // Huerto pedido: solo las personas que trabajaron en él en el rango (con
    // todos sus tramos y cubetas, de cualquier huerto)
    const inRange = (d: string) => d >= start_date && d <= end_date
    const startMs = Date.parse(toNZBoundary(start_date, '00:00:00'))
    const endMs = Date.parse(toNZBoundary(addDays(end_date, 1), '00:00:00'))
    const atOrchard = orchard_id
        ? new Set<string>([
            ...((attendance ?? []) as Att[]).filter(a => a.orchard_id === orchard_id && inRange(a.date.slice(0, 10))).map(a => a.picker_id),
            ...((events ?? []) as Ev[]).filter(e => e.orchard_id === orchard_id && Date.parse(e.scanned_at) >= startMs && Date.parse(e.scanned_at) < endMs).map(e => e.picker_id),
        ])
        : null
    const attRows = ((attendance ?? []) as Att[]).filter(a => !atOrchard || atOrchard.has(a.picker_id)).map(a => ({
        pickerId: a.picker_id,
        orchardId: a.orchard_id,
        date: a.date.slice(0, 10),
        checkIn: a.check_in,
        checkOut: a.check_out,
        breakStart: a.break_start,
        breakMinutes: a.break_minutes,
    }))
    const bucketRows = ((events ?? []) as Ev[]).filter(e => !atOrchard || atOrchard.has(e.picker_id)).map(e => ({
        pickerId: e.picker_id,
        orchardId: e.orchard_id,
        variety: e.variety,
        scannedAt: e.scanned_at,
        qualityGrade: e.quality_grade,
        pieceRate: pieceRateOn(dailyRates, e.orchard_id, e.variety, nzDateOf(e.scanned_at), (e.orchard_id ? orchardRates[e.orchard_id] : undefined) ?? companyBucketRate),
    }))

    // Tarifa por hora del contrato: si es mayor que el mínimo, es el mínimo
    // garantizado de esa persona (nadie cobra menos de lo firmado).
    const { data: contractRows } = await supabase
        .from('contracts')
        .select('employee_id, hourly_rate, start_date, end_date, status')
        // Un contrato borrado no sube el mínimo de nadie
        .is('deleted_at', null)
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
    const allRows = restrictToRange([...groups.entries()].flatMap(([minWage, ids]) => payForRange({
        attendance: attRows.filter(a => ids.has(a.pickerId)),
        buckets: bucketRows.filter(b => ids.has(b.pickerId)),
        pieceRate: companyBucketRate,
        minWage,
        isPublicHoliday,
    })), start_date, end_date)
    // Huerto pedido: la parte de ese huerto de cada día (horas con su mitad de
    // trayectos, sus cubetas y su parte del complemento), igual que el coste por huerto
    const rows = (orchard_id ? onlyOrchardShare(allRows, orchard_id) : allRows).sort((a, b) => b.buckets - a.buckets)
    const pickerIds = rows.map(r => r.pickerId)

    // Por trozos: con ~250 personas en la URL Kong respondía 414 y la nómina
    // salía sin nombres (prueba de carga 2026-10-21)
    const names = await fetchInChunks<{ id: string; name: string }>(pickerIds, (chunk, from, to) =>
        supabase.from('pickers').select('id, name').in('id', chunk).order('id').range(from, to))
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
        // Horas y cubetas del día que cuentan aquí (huerto pedido: su parte)
        const share = (d: PayDay) => orchard_id
            ? (d.byOrchard.find(o => o.orchardId === orchard_id) ?? { hours: 0, buckets: 0 })
            : d
        const holidayDays = r.dayDetails.filter(d => d.isPublicHoliday)
        const hours_holiday = r2(holidayDays.reduce((s, d) => s + share(d).hours, 0))
        // Día alternativo solo si consta que trabajó (horas o cubetas); un turno
        // sin cerrar y sin cubetas (0 h, "revisar") no lo genera hasta que se corrija
        const holidaysWorked = holidayDays.filter(d => share(d).hours > 0 || share(d).buckets > 0).length
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
            alternative_holidays_owed: holidaysWorked,
            estimated_days: r.estimatedDays,
            days: r.dayDetails,
        })

        total_buckets += r.buckets
        total_hours += r.hours
        total_piece_rate_earnings += r.pieceEarnings
        total_top_up += r.topUp
        total_alternative_holidays_owed += holidaysWorked
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
