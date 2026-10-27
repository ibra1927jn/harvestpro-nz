/**
 * calculate-payroll: cifras contra reglas NZ calculadas a mano.
 *
 * - Mínimo legal 23.95 $/h (Minimum Wage Order 2026).
 * - Complemento al mínimo POR DÍA (un día bueno no tapa uno malo).
 * - Descanso de comida de 30 min no pagado SOLO si el team leader lo anotó
 *   (decisión del dueño 2026-10-14): sin anotar no se descuenta nada.
 * - Cubetas 'reject' no se pagan.
 * - Trayecto entre huertos pagado, la mitad a cada huerto.
 * - Vacaciones 8 %, PAYE, KiwiSaver y ACC NO se calculan aquí (Xero).
 */
import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { PayrollResult, PickerBreakdown } from '../_shared/payroll-calc.ts'
import type { PayDay } from '../_shared/pay-rules.ts'
import {
    addDays, call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, randomMonday, service, show, testOpts,
} from './_helpers.ts'

async function attendance(pickerId: string, orchardId: string, date: string, from: string, to: string | null, breakAt?: string): Promise<void> {
    must(await service.from('daily_attendance').insert({
        picker_id: pickerId, orchard_id: orchardId, date,
        check_in: nzTime(date, from), check_out: to ? nzTime(date, to) : null, status: 'present',
        break_start: breakAt ? nzTime(date, breakAt) : null,
    }), 'attendance.insert')
}

/** n cubetas desde la hora `from`, una cada `everyMin` minutos */
async function buckets(pickerId: string, orchardId: string, date: string, from: string, n: number, everyMin: number, grade = 'A'): Promise<void> {
    const start = new Date(nzTime(date, from)).getTime()
    const rows = Array.from({ length: n }, (_, i) => ({
        picker_id: pickerId, orchard_id: orchardId, quality_grade: grade,
        scanned_at: new Date(start + i * everyMin * 60_000 + (grade === 'reject' ? 30_000 : 0)).toISOString(),
    }))
    must(await service.from('bucket_records').insert(rows), 'buckets.insert')
}

Deno.test({ name: 'calculate-payroll matches hand-computed NZ pay', ...testOpts, fn: async t => {
    try {
        // Huerto A: 5 $/cubeta; huerto B: 7 $/cubeta (la BD ya impide guardar un mínimo < 23.95)
        const orchardA = await makeOrchard({ piece_rate: 5, min_wage_rate: 23.95 })
        const orchardB = await makeOrchard({ piece_rate: 7, min_wage_rate: 23.95 })
        const payroll = await makeUser('payroll_admin', { orchardId: orchardA })
        const p1 = await makePicker(orchardA)
        const p2 = await makePicker(orchardA)
        const p3 = await makePicker(orchardA)
        const p4 = await makePicker(orchardA)

        const monday = randomMonday(2019)
        const tue = addDays(monday, 1)
        const wed = addDays(monday, 2)

        // P1 martes: 08:00–16:30 (8.5 h − 0.5 descanso anotado = 8 h), 20 cubetas + 1 rechazada
        await attendance(p1.id, orchardA, tue, '08:00', '16:30', '12:00')
        await buckets(p1.id, orchardA, tue, '08:10', 20, 20)
        await buckets(p1.id, orchardA, tue, '09:00', 1, 1, 'reject')
        // P1 miércoles: 07:00–10:00 (3 h, sin descanso), 40 cubetas → día bueno
        await attendance(p1.id, orchardA, wed, '07:00', '10:00')
        await buckets(p1.id, orchardA, wed, '07:01', 40, 4)
        // P2 martes: 07:00–12:00 (5 h − 0.5 anotado = 4.5 h), 30 cubetas → sin complemento
        await attendance(p2.id, orchardA, tue, '07:00', '12:00', '09:30')
        await buckets(p2.id, orchardA, tue, '07:05', 30, 9)
        // P3 martes: A 07:00–11:00, viaje 1 h, B 12:00–15:00
        await attendance(p3.id, orchardA, tue, '07:00', '11:00', '09:00')
        await attendance(p3.id, orchardB, tue, '12:00', '15:00')
        // P4 martes: 07:00–13:00 sin descanso anotado → 6 h pagadas (no se descuenta)
        await attendance(p4.id, orchardA, tue, '07:00', '13:00')
        await buckets(p3.id, orchardA, tue, '07:10', 10, 20)
        await buckets(p3.id, orchardB, tue, '12:05', 10, 15)

        const company = await call<PayrollResult>('calculate-payroll', {
            token: payroll.token, body: { start_date: monday, end_date: addDays(monday, 6) },
        })
        assertEquals(company.status, 200, show(company))
        const byId = new Map<string, PickerBreakdown>(company.json.picker_breakdown.map(p => [p.picker_id, p]))
        const pickerOf = (id: string): PickerBreakdown => {
            const p = byId.get(id)
            assert(p, `picker ${id} in breakdown`)
            return p
        }
        assertEquals(company.json.settings.min_wage_rate, 23.95, 'legal floor 23.95 (no orchard may pay less)')

        await t.step('daily top-up to 23.95/h; a good day does not offset a bad one; rejects unpaid', () => {
            const p = pickerOf(p1.id)
            assertEquals(p.buckets, 60)
            assertEquals(p.hours_worked, 11)
            assertEquals(p.piece_rate_earnings, 300)
            // martes: 8 h × 23.95 = 191.60 − 100 de cubetas = 91.60; miércoles: 0
            assertEquals(p.top_up_required, 91.6)
            assertEquals(p.total_earnings, 391.6)
            assertEquals(p.is_below_minimum, true)
            const day = (d: string): PayDay => {
                const found = p.days.find(x => x.date === d)
                assert(found, `day ${d}`)
                return found
            }
            assertEquals(day(tue).hours, 8)
            assertEquals(day(tue).breakMinutes, 30)
            assertEquals(day(tue).total, 191.6)
            assertEquals(day(wed).topUp, 0)
            assertEquals(day(wed).total, 200)
        })

        await t.step('no break recorded: nothing deducted (6 h × 23.95 = 143.70)', () => {
            const day = pickerOf(p4.id).days[0]
            assertEquals(day.hours, 6)
            assertEquals(day.breakMinutes, 0)
            assertEquals(day.total, 143.7)
        })

        await t.step('piece rate above the minimum: no top-up', () => {
            const p = pickerOf(p2.id)
            assertEquals(p.hours_worked, 4.5)
            assertEquals(p.piece_rate_earnings, 150)
            assertEquals(p.top_up_required, 0)
            assertEquals(p.total_earnings, 150)
            assertEquals(p.is_below_minimum, false)
        })

        await t.step('travel between orchards is paid and split half/half', () => {
            const day = pickerOf(p3.id).days[0]
            // 4 h + 1 h viaje + 3 h = 8 h − 0.5 descanso anotado = 7.5 h
            assertEquals(day.hours, 7.5)
            assertEquals(day.travelMinutes, 60)
            assertEquals(day.segments.map(s => s.travelHours), [0.5, 0.5])
            // 10 × 5 + 10 × 7 = 120; 7.5 × 23.95 = 179.625 → complemento 59.63
            assertEquals(day.pieceEarnings, 120)
            assertEquals(day.topUp, 59.63)
            assertEquals(day.total, 179.63)
            // Reparto por huerto según (horas allí + mitad del viaje): A 4.5/8, B 3.5/8
            const shareA = day.byOrchard.find(o => o.orchardId === orchardA)
            const shareB = day.byOrchard.find(o => o.orchardId === orchardB)
            assert(shareA && shareB, 'both orchards in byOrchard')
            assertEquals(shareA.hours, 4.22)
            assertEquals(shareB.hours, 3.28)
            assertEquals(shareA.pieceEarnings, 50)
            assertEquals(shareB.pieceEarnings, 70)
            assertEquals(shareA.topUp, 33.54)
            assertEquals(shareB.topUp, 26.09)
            assertAlmostEquals(shareA.total + shareB.total, day.total, 0.001)
        })

        await t.step('no holiday pay / PAYE / KiwiSaver / ACC in the result (Xero does it)', () => {
            const text = company.text.toLowerCase()
            for (const word of ['paye', 'kiwisaver', 'acc_levy', 'holiday_pay']) assert(!text.includes(word), word)
        })

        await t.step('orchard view: only that orchard\'s data', async () => {
            const r = await call<PayrollResult>('calculate-payroll', {
                token: payroll.token, body: { orchard_id: orchardB, start_date: monday, end_date: addDays(monday, 6) },
            })
            assertEquals(r.status, 200, show(r))
            const ids = r.json.picker_breakdown.map(p => p.picker_id)
            assertEquals(ids, [p3.id])
            assertEquals(r.json.picker_breakdown[0].buckets, 10)
            assertEquals(r.json.picker_breakdown[0].piece_rate_earnings, 70)
            // Su parte del día en B (horas con media hora de viaje, parte del complemento):
            // lo mismo que el coste por huerto de la nómina de empresa (70 + 26.09)
            assertEquals(r.json.picker_breakdown[0].hours_worked, 3.28)
            assertEquals(r.json.picker_breakdown[0].top_up_required, 26.09)
            assertEquals(r.json.picker_breakdown[0].total_earnings, 96.09)

            const a = await call<PayrollResult>('calculate-payroll', {
                token: payroll.token, body: { orchard_id: orchardA, start_date: monday, end_date: addDays(monday, 6) },
            })
            assertEquals(a.json.settings.min_wage_rate, 23.95)
            const p = a.json.picker_breakdown.find(x => x.picker_id === p1.id)
            assertEquals(p?.top_up_required, 91.6)
        })

        // Un manager solo lee los precios de SU huerto (20261027050000), pero su
        // parte del día se calcula con el día entero, también lo de otro huerto
        await t.step('manager of B: own share uses orchard A\'s price too; never another orchard', async () => {
            const managerB = await makeUser('manager', { orchardId: orchardB })
            const week = { start_date: monday, end_date: addDays(monday, 6) }
            const own = await call<PayrollResult>('calculate-payroll', {
                token: managerB.token, body: { orchard_id: orchardB, ...week },
            })
            assertEquals(own.status, 200, show(own))
            const p = own.json.picker_breakdown.find(x => x.picker_id === p3.id)
            // Lo mismo que ve nómina: 70 + 26.09 (con el precio de B en A saldría otro complemento)
            assertEquals(p?.top_up_required, 26.09)
            assertEquals(p?.total_earnings, 96.09)
            assertEquals(own.json.settings.bucket_rate, 7)

            const other = await call('calculate-payroll', {
                token: managerB.token, body: { orchard_id: orchardA, ...week },
            })
            assertEquals(other.status, 403, show(other))

            // Sin orchard_id (lo que pide la pantalla de Nómina): también solo su huerto
            const company = await call<PayrollResult>('calculate-payroll', { token: managerB.token, body: week })
            assertEquals(company.status, 200, show(company))
            assertEquals(company.json.orchard_id, orchardB)
            // El precio que se le enseña es el de su huerto, no el de un huerto cualquiera
            assertEquals(company.json.settings.bucket_rate, 7)
            assertEquals(company.json.picker_breakdown.map(x => x.picker_id), [p3.id])
            assertEquals(company.json.summary.total_earnings, 96.09)
        })

        // Decisión del dueño (27-10): el manager ve solo la parte de su huerto.
        // p3 trabajó en A (precio 5) y en B (precio 7) el martes.
        await t.step('manager of B: no line, hour, bucket or price of orchard A anywhere', async () => {
            const managerB = await makeUser('manager', { orchardId: orchardB })
            for (const body of [{ start_date: monday, end_date: addDays(monday, 6) }, { orchard_id: orchardB, start_date: monday, end_date: addDays(monday, 6) }]) {
                const r = await call<PayrollResult>('calculate-payroll', { token: managerB.token, body })
                assertEquals(r.status, 200, show(r))
                assert(!r.text.includes(orchardA), `orchard A appears in the manager's payroll: ${r.text.slice(0, 400)}`)
                for (const id of [p1.id, p2.id, p4.id]) assert(!r.text.includes(id), 'only people who worked in B')
                const [day] = r.json.picker_breakdown[0].days as PayDay[]
                assert(day.segments.length > 0 && day.segments.every(s => s.orchardId === orchardB), 'only B segments')
                assertEquals(day.byOrchard.map(o => o.orchardId), [orchardB])
                assertEquals(day.pieceLines.map(l => [l.orchardId, l.rate, l.buckets]), [[orchardB, 7, 10]])
                assertEquals(day.bucketsByVariety, { '—': 10 })
                // Su parte del día (lo mismo que su fila): 3.28 h, 70 + 26.09
                assertEquals([day.hours, day.buckets, day.pieceEarnings, day.topUp, day.total], [3.28, 10, 70, 26.09, 96.09])
            }
            // Nómina sigue viendo el día entero, con el huerto de cada línea
            const all = await call<PayrollResult>('calculate-payroll', { token: payroll.token, body: { start_date: monday, end_date: addDays(monday, 6) } })
            const whole = all.json.picker_breakdown.find(x => x.picker_id === p3.id)!.days[0]
            assertEquals(whole.pieceLines.map(l => [l.orchardId, l.rate]).sort(), [[orchardA, 5], [orchardB, 7]].sort())
            assertEquals(whole.topUp, 59.63)
        })

        await t.step('unknown orchard → 400 without leaking internals', async () => {
            const r = await call('calculate-payroll', {
                token: payroll.token, body: { orchard_id: crypto.randomUUID(), start_date: monday, end_date: addDays(monday, 6) },
            })
            assertEquals(r.status, 400, show(r))
        })
    } finally {
        await cleanupAll()
    }
} })
