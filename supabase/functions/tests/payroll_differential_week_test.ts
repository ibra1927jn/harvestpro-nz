/**
 * Semana realista contra la BASE DE DATOS y la Edge Function reales, comparada
 * con la implementación de referencia (src/test/payroll-reference/reference.ts).
 *
 * Semana de Matariki 2026 (lun 6 → dom 12 de julio; festivo el viernes 10):
 * dos huertos de prueba con precio por huerto y por variedad, siete personas
 * (rápida, lenta con complemento, dos que cambian de huerto con trayecto, una
 * con contrato por encima del mínimo, una con rechazos y descanso anotado, una
 * que trabaja el festivo, un día sin cubetas, escaneos antes de la entrada y
 * después de la salida y un turno que cruza la medianoche).
 *
 * Comprueba: calculate-payroll de la empresa = referencia al céntimo;
 * calculate-payroll de un huerto = su parte de la nómina de empresa; la foto
 * de close-pay-week = calculate-payroll; reabrir vuelve al cálculo en vivo.
 *
 * Ejecutar con el runtime de ESTE checkout (scripts/payroll-differential-week.sh).
 * Todo lo que crea se borra al final; la semana se reabre antes de borrar.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { PayrollResult } from '../_shared/payroll-calc.ts'
import { referencePay, REF_NZ_PUBLIC_HOLIDAYS, type RefBucket, type RefShift, type RefDay } from '../../../src/test/payroll-reference/reference.ts'
import { addDays, call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, onCleanup, service, show, testOpts } from './_helpers.ts'

const MONDAY = '2026-07-06'
const SUNDAY = addDays(MONDAY, 6)

/** PRNG determinista: la semana es siempre la misma */
function prng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0x1_0000_0000
    }
}

const cents = (n: number) => Math.round(n * 100)
const at = (date: string, hhmm: string, plusMin = 0) => new Date(new Date(nzTime(date, hhmm)).getTime() + plusMin * 60_000).toISOString()

Deno.test({ name: 'payroll differential: realistic week in the DB vs reference', ...testOpts, fn: async t => {
    const rnd = prng(20260710)
    try {
        // Una semana ya cerrada por otra prueba bloquearía los datos
        const { data: existing } = await service.from('pay_weeks').select('status').eq('week_start', MONDAY).maybeSingle()
        assert(!existing || existing.status !== 'closed', `pay week ${MONDAY} is already closed in this DB`)

        const A = await makeOrchard({ piece_rate: 6.5, min_wage_rate: 23.95 })
        const B = await makeOrchard({ piece_rate: 7.2, min_wage_rate: 23.95 })
        const payroll = await makeUser('payroll_admin', { orchardId: A })
        // Precios por día (piece_rates): Envy en B; Jazz en A, que sube el jueves;
        // el general de A sube el miércoles (no debe cambiar el lunes ni el martes)
        const JAZZ = `Jazz-${A.slice(0, 4)}`
        const { data: vr } = must(await service.from('piece_rates').insert([
            { orchard_id: B, variety: 'Envy', effective_date: '2026-01-01', piece_rate: 11.35 },
            { orchard_id: A, variety: JAZZ, effective_date: '2026-01-01', piece_rate: 9.1 },
            { orchard_id: A, variety: JAZZ, effective_date: addDays(MONDAY, 3), piece_rate: 9.6 },
            { orchard_id: A, variety: null, effective_date: addDays(MONDAY, 2), piece_rate: 6.9 },
        ]).select('id'), 'piece_rates.insert')
        onCleanup(() => service.from('piece_rates').delete().in('orchard_id', [A, B]))
        void vr

        const people = await Promise.all(Array.from({ length: 7 }, () => makePicker(A)))
        const [fast, slow, mover, contracted, rejecter, holidayWorker, slowMover] = people.map(p => p.id)
        // Contrato a 26.00 $/h (por encima del mínimo)
        const { data: k } = must(await service.from('contracts').insert({
            employee_id: contracted, orchard_id: A, type: 'seasonal', status: 'active', start_date: '2026-01-01', hourly_rate: 26,
        }).select('id').single(), 'contracts.insert')
        onCleanup(() => service.from('contracts').delete().eq('id', k!.id))

        const shifts: RefShift[] = []
        const buckets: RefBucket[] = []
        const shift = (pickerId: string, orchardId: string, date: string, from: string, to: string, extra: { breakAt?: string; toDate?: string } = {}) => {
            shifts.push({
                pickerId, orchardId, date, checkIn: at(date, from), checkOut: at(extra.toDate ?? date, to),
                breakStart: extra.breakAt ? at(date, extra.breakAt) : null, breakMinutes: 30,
            })
        }
        const usedScan = new Set<string>()
        /** n cubetas repartidas entre dos instantes */
        const scans = (pickerId: string, orchardId: string, variety: string | null, fromIso: string, toIso: string, n: number, rejectRate = 0.02) => {
            const a = new Date(fromIso).getTime(), b = new Date(toIso).getTime()
            for (let i = 0; i < n; i++) {
                // Único por persona e instante (índice bucket_records_picker_scan_unique)
                let t = a + Math.floor(rnd() * (b - a) / 60_000) * 60_000
                while (usedScan.has(`${pickerId}|${t}`)) t += 1000
                usedScan.add(`${pickerId}|${t}`)
                buckets.push({
                    pickerId, orchardId, variety,
                    scannedAt: new Date(t).toISOString(),
                    grade: rnd() < rejectRate ? 'reject' : (['A', 'A', 'B', 'C'] as const)[Math.floor(rnd() * 4)],
                })
            }
        }

        for (let d = 0; d < 6; d++) {
            const date = addDays(MONDAY, d)
            // Rápida: 07:30–16:30 en A, 70–90 cubetas (Gala y Jazz)
            shift(fast, A, date, '07:30', '16:30')
            scans(fast, A, 'Gala', at(date, '07:35'), at(date, '16:25'), 50 + Math.floor(rnd() * 20))
            scans(fast, A, JAZZ, at(date, '07:35'), at(date, '16:25'), 20)
            // Lenta: 08:00–15:00, 12–20 cubetas → complemento al mínimo
            shift(slow, A, date, '08:00', '15:00')
            scans(slow, A, 'Gala', at(date, '08:10'), at(date, '14:50'), 12 + Math.floor(rnd() * 8))
            // Contrato 26 $/h: 07:00–15:30, 25–30 cubetas
            shift(contracted, A, date, '07:00', '15:30')
            scans(contracted, A, 'Gala', at(date, '07:10'), at(date, '15:20'), 25 + Math.floor(rnd() * 6))
        }
        for (let d = 0; d < 5; d++) {
            const date = addDays(MONDAY, d)
            // Cambia de huerto: A 07:00–11:30, 40 min de trayecto, B 12:10–16:00 (Envy)
            shift(mover, A, date, '07:00', '11:30')
            shift(mover, B, date, '12:10', '16:00')
            scans(mover, A, 'Gala', at(date, '07:05'), at(date, '11:25'), 30)
            scans(mover, B, 'Envy', at(date, '12:15'), at(date, '15:55'), 18)
            // Cambia de huerto y no llega al mínimo: complemento repartido entre A y B
            shift(slowMover, A, date, '07:00', '11:30')
            shift(slowMover, B, date, '12:10', '16:00')
            scans(slowMover, A, 'Gala', at(date, '07:05'), at(date, '11:25'), 10)
            scans(slowMover, B, 'Gala', at(date, '12:15'), at(date, '15:55'), 6)
            // Rechazos (20 %) y descanso anotado a las 12:00
            shift(rejecter, A, date, '07:30', '15:30', { breakAt: '12:00' })
            scans(rejecter, A, 'Gala', at(date, '07:40'), at(date, '15:20'), 40, 0.2)
        }
        // Trabaja el festivo (viernes 10, Matariki) y el sábado; miércoles sin cubetas
        const wed = addDays(MONDAY, 2), thu = addDays(MONDAY, 3), fri = addDays(MONDAY, 4), sat = addDays(MONDAY, 5), tue = addDays(MONDAY, 1)
        shift(holidayWorker, A, wed, '08:00', '11:00')
        shift(holidayWorker, B, thu, '08:00', '16:00')
        // Escaneos 20 min antes de la entrada y 15 min después de la salida
        scans(holidayWorker, B, 'Envy', at(thu, '07:40'), at(thu, '16:15'), 45)
        shift(holidayWorker, A, fri, '08:00', '14:00')
        scans(holidayWorker, A, JAZZ, at(fri, '08:05'), at(fri, '13:55'), 33)
        shift(holidayWorker, A, sat, '08:00', '12:00')
        scans(holidayWorker, A, 'Gala', at(sat, '08:05'), at(sat, '11:55'), 9)
        // Turno de noche del martes que cruza la medianoche (cubetas después de las 00:00)
        shift(holidayWorker, B, tue, '19:00', '00:45', { toDate: wed })
        scans(holidayWorker, B, 'Envy', at(tue, '19:10'), at(wed, '00:40'), 20)

        // A la base de datos (las filas de prueba se borran con huertos y personas)
        must(await service.from('daily_attendance').insert(shifts.map(s => ({
            picker_id: s.pickerId, orchard_id: s.orchardId, date: s.date, check_in: s.checkIn, check_out: s.checkOut,
            break_start: s.breakStart, break_minutes: s.breakMinutes, status: 'present',
        }))), 'attendance.insert')
        for (let i = 0; i < buckets.length; i += 500) {
            must(await service.from('bucket_records').insert(buckets.slice(i, i + 500).map(b => ({
                picker_id: b.pickerId, orchard_id: b.orchardId, variety: b.variety, scanned_at: b.scannedAt, quality_grade: b.grade,
            }))), 'buckets.insert')
        }

        // Referencia con las tarifas que hay en la BD (la Edge Function usa las de toda la empresa)
        const { data: settings } = await service.from('harvest_settings').select('orchard_id, piece_rate, min_wage_rate')
        const { data: daily } = await service.from('piece_rates').select('orchard_id, variety, effective_date, piece_rate')
        const orchardRates: Record<string, number> = {}
        for (const s of settings ?? []) if (s.piece_rate != null) orchardRates[s.orchard_id] = Number(s.piece_rate)
        const companyMin = Math.max(23.95, ...(settings ?? []).map(s => Number(s.min_wage_rate ?? 0)))
        const rates = {
            daily: (daily ?? []).map(v => ({ orchardId: v.orchard_id, variety: v.variety, from: String(v.effective_date).slice(0, 10), rate: Number(v.piece_rate) })),
            orchardRates,
            fallback: 6.5,
        }
        const ref = referencePay(shifts, buckets, {
            rates, minWage: companyMin, contractRates: { [contracted]: 26 }, holidays: REF_NZ_PUBLIC_HOLIDAYS, now: new Date(), hoursRounding: 'centihour',
        }).filter(d => d.date >= MONDAY && d.date <= SUNDAY)
        const ours = new Set(people.map(p => p.id))

        const company = await call<PayrollResult>('calculate-payroll', { token: payroll.token, body: { start_date: MONDAY, end_date: SUNDAY } })
        assertEquals(company.status, 200, show(company))

        await t.step('company payroll = reference, per person and per day, to the cent', () => {
            for (const id of ours) {
                const p = company.json.picker_breakdown.find(x => x.picker_id === id)
                assert(p, `picker ${id} in payroll`)
                const days = ref.filter(d => d.pickerId === id)
                assertEquals(p.days.map(d => d.date), days.map(d => d.date), `days of ${id}`)
                for (const d of p.days) {
                    const r = days.find(x => x.date === d.date) as RefDay
                    assertEquals(
                        [d.date, d.hours, d.buckets, cents(d.pieceEarnings), cents(d.holidayPremium), cents(d.topUp), cents(d.total)],
                        [r.date, r.hours, r.buckets, r.pieceCents, r.premiumCents, r.topUpCents, r.totalCents],
                        `${id} ${d.date}`,
                    )
                }
                assertEquals(cents(p.total_earnings), days.reduce((s, d) => s + d.totalCents, 0))
                assertEquals(p.alternative_holidays_owed, days.filter(d => d.holiday).length)
            }
            // El trabajador del festivo cobra a tiempo y medio ese día
            const fri10 = company.json.picker_breakdown.find(x => x.picker_id === holidayWorker)!.days.find(d => d.date === fri)!
            assert(fri10.isPublicHoliday && fri10.holidayPremium > 0, 'Matariki paid at time and a half')
        })

        await t.step('per-orchard calculate-payroll = that orchard\'s share of the company payroll', async () => {
            const lines: string[] = []
            for (const [name, orchard] of [['A', A], ['B', B]] as const) {
                const r = await call<PayrollResult>('calculate-payroll', { token: payroll.token, body: { orchard_id: orchard, start_date: MONDAY, end_date: SUNDAY } })
                assertEquals(r.status, 200, show(r))
                for (const id of ours) {
                    const own = r.json.picker_breakdown.find(p => p.picker_id === id)
                    const share = company.json.picker_breakdown.find(p => p.picker_id === id)?.days
                        .flatMap(d => d.byOrchard).filter(o => o.orchardId === orchard).reduce((s, o) => s + cents(o.total), 0) ?? 0
                    const diff = cents(own?.total_earnings ?? 0) - share
                    if (diff !== 0) lines.push(`orchard ${name} picker ${people.findIndex(p => p.id === id) + 1}: per-orchard ${(own?.total_earnings ?? 0).toFixed(2)} vs company share ${(share / 100).toFixed(2)} (${diff > 0 ? '+' : ''}${(diff / 100).toFixed(2)})`)
                }
            }
            assertEquals(lines, [], 'per-orchard payroll = its share of the company payroll')
        })

        await t.step('close-pay-week snapshot = live payroll; reopen goes back to live', async () => {
            const closed = await call<{ closed?: boolean; reason?: string }>('close-pay-week', { token: payroll.token, body: { action: 'close', week_start: MONDAY } })
            assertEquals(closed.status, 200, show(closed))
            assertEquals(closed.json.closed, true, show(closed))
            try {
                const snap = await call<PayrollResult & { closed?: unknown }>('calculate-payroll', { token: payroll.token, body: { start_date: MONDAY, end_date: SUNDAY } })
                assert(snap.json.closed, 'returns the closed snapshot')
                const { closed: _c, ...rest } = snap.json
                assertEquals(rest, company.json)
            } finally {
                const re = await call('close-pay-week', { token: payroll.token, body: { action: 'reopen', week_start: MONDAY, reason: 'payroll differential test cleanup' } })
                assertEquals(re.status, 200, show(re))
            }
            const again = await call<PayrollResult>('calculate-payroll', { token: payroll.token, body: { start_date: MONDAY, end_date: SUNDAY } })
            assertEquals(again.json, company.json)
        })
    } finally {
        await service.from('pay_weeks').delete().eq('week_start', MONDAY).eq('status', 'reopened')
        await cleanupAll()
    }
} })
