/**
 * Nómina vista desde UN huerto (decisión del dueño, 2026-10-27): el manager
 * solo ve la parte de su huerto. La gente rota entre huertos y el complemento
 * al mínimo se calcula con el día entero, pero lo que sale hacia el manager es
 * solo lo de su huerto:
 * - tramos (huerto, entrada, salida) de ese huerto;
 * - cubetas, variedades y líneas de precio (pieceLines) recogidas allí;
 * - horas, plus de festivo, complemento y total: su parte (byOrchard);
 * - nada de otros huertos (ni sus horas, ni sus cubetas, ni sus precios).
 *
 * Lo usan calculate-payroll (vista de un huerto, también la foto de una semana
 * cerrada) y check-compliance (manager y team leader).
 */
import { PAY_RULES, type OrchardShare, type PayDay } from './pay-rules.ts'
import type { PayrollResult, PickerBreakdown } from './payroll-calc.ts'

const cents = (n: number) => Math.round(n * 100)
const r2 = (n: number) => Math.round(n * 100) / 100
const sumCents = <T>(items: ReadonlyArray<T>, f: (x: T) => number) => items.reduce((s, x) => s + cents(f(x)), 0) / 100

/** ¿Trabajó la persona ese día en el huerto (tramo o cubetas)? */
export function dayTouchesOrchard(day: Pick<PayDay, 'byOrchard' | 'segments'>, orchardId: string): boolean {
    return (day.byOrchard ?? []).some(o => o.orchardId === orchardId) || (day.segments ?? []).some(s => s.orchardId === orchardId)
}

/**
 * El día de una persona tal como lo ve un huerto: solo sus tramos, cubetas y
 * precios, y como importes su parte del día. Las marcas del día (festivo,
 * estimado, por debajo del mínimo, revisar) se quedan: no son cifras de otro huerto.
 */
export function orchardDayView(day: PayDay, orchardId: string): PayDay {
    const share: OrchardShare = (day.byOrchard ?? []).find(o => o.orchardId === orchardId)
        ?? { orchardId, hours: 0, buckets: 0, pieceEarnings: 0, holidayPremium: 0, topUp: 0, total: 0 }
    const segments = (day.segments ?? []).filter(s => s.orchardId === orchardId)
    const onlyHere = (day.byOrchard ?? []).every(o => o.orchardId === orchardId)
        && (day.segments ?? []).every(s => s.orchardId === orchardId)
    // Líneas de este huerto. Las de semanas cerradas antes de que la línea
    // llevara huerto: si el día fue entero aquí son todas suyas; si no, no se
    // pueden atribuir y no se enseñan (el importe sigue en pieceEarnings).
    const pieceLines = (day.pieceLines ?? []).filter(l =>
        (l as { orchardId?: string | null }).orchardId === undefined ? onlyHere : l.orchardId === orchardId)
    const bucketsByVariety: Record<string, number> = {}
    if (onlyHere) Object.assign(bucketsByVariety, day.bucketsByVariety)
    else for (const l of pieceLines) bucketsByVariety[l.variety] = (bucketsByVariety[l.variety] ?? 0) + l.buckets
    const ownBreak = segments.some(s => !!s.breakStart)
    return {
        ...day,
        segments,
        hours: share.hours,
        breakMinutes: onlyHere || ownBreak ? day.breakMinutes : 0,
        // Su mitad de cada trayecto (ya va dentro de sus horas)
        travelMinutes: Math.round(segments.reduce((s, x) => s + (x.travelHours ?? 0), 0) * 60),
        buckets: share.buckets,
        bucketsByVariety,
        pieceLines,
        byOrchard: [share],
        pieceEarnings: share.pieceEarnings,
        holidayPremium: share.holidayPremium ?? 0,
        topUp: share.topUp,
        total: share.total,
    }
}

/**
 * Una nómina de empresa (p. ej. la foto de una semana cerrada) reducida a un
 * huerto: cada persona con sus días en ese huerto y sus totales de esos días.
 * minimum_required (informativo) se reparte en proporción a las horas.
 */
export function payrollForOrchard(result: PayrollResult, orchardId: string): PayrollResult {
    const picker_breakdown: PickerBreakdown[] = []
    for (const p of result.picker_breakdown ?? []) {
        const whole = (p.days ?? []).filter(d => dayTouchesOrchard(d, orchardId))
        if (whole.length === 0) continue
        const days = whole.map(d => orchardDayView(d, orchardId))
        const mult = (d: PayDay) => (d.isPublicHoliday ? PAY_RULES.publicHolidayMultiplier : 1)
        const weightAll = (p.days ?? []).reduce((s, d) => s + d.hours * mult(d), 0)
        const weightHere = days.reduce((s, d) => s + d.hours * mult(d), 0)
        const hours_worked = sumCents(days, d => d.hours)
        const hours_holiday = sumCents(days.filter(d => d.isPublicHoliday), d => d.hours)
        const piece_rate_earnings = sumCents(days, d => d.pieceEarnings)
        picker_breakdown.push({
            ...p,
            buckets: days.reduce((s, d) => s + d.buckets, 0),
            hours_worked,
            hours_ordinary: r2(hours_worked - hours_holiday),
            hours_holiday,
            piece_rate_earnings,
            holiday_premium: sumCents(days, d => d.holidayPremium ?? 0),
            hourly_rate: hours_worked > 0 ? r2(piece_rate_earnings / hours_worked) : 0,
            minimum_required: weightAll > 0 ? r2(p.minimum_required * weightHere / weightAll) : 0,
            top_up_required: sumCents(days, d => d.topUp),
            total_earnings: sumCents(days, d => d.total),
            is_below_minimum: days.some(d => d.belowMinimum),
            alternative_holidays_owed: days.filter(d => d.isPublicHoliday && (d.hours > 0 || d.buckets > 0)).length,
            estimated_days: days.filter(d => d.estimated).length,
            days,
        })
    }
    picker_breakdown.sort((a, b) => b.buckets - a.buckets)
    const workers_total = picker_breakdown.length
    const workers_below_minimum = picker_breakdown.filter(p => p.is_below_minimum).length
    return {
        ...result,
        orchard_id: orchardId,
        summary: {
            total_buckets: picker_breakdown.reduce((s, p) => s + p.buckets, 0),
            total_hours: sumCents(picker_breakdown, p => p.hours_worked),
            total_piece_rate_earnings: sumCents(picker_breakdown, p => p.piece_rate_earnings),
            total_top_up: sumCents(picker_breakdown, p => p.top_up_required),
            total_earnings: sumCents(picker_breakdown, p => p.total_earnings),
            total_alternative_holidays_owed: picker_breakdown.reduce((s, p) => s + p.alternative_holidays_owed, 0),
            total_estimated_days: picker_breakdown.reduce((s, p) => s + p.estimated_days, 0),
        },
        compliance: {
            workers_below_minimum,
            workers_total,
            compliance_rate: workers_total > 0 ? r2(((workers_total - workers_below_minimum) / workers_total) * 100) : 100,
        },
        picker_breakdown,
    }
}
