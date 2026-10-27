/**
 * check-compliance y detect-anomalies (panel del manager / team leader).
 *
 * Datos de HOY (hora NZ) en un huerto de prueba; las horas son fijas (turno
 * cerrado) para que el resultado no dependa de la hora a la que corre el test.
 */
import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, nzToday, seededToken, service, show, testOpts,
} from './_helpers.ts'

type Violation = { type: string; severity: string }
type PickerCompliance = {
    picker_id: string
    picker_name: string
    violations: Violation[]
    metrics: { hours_worked: number; buckets_today: number; effective_hourly_rate: number; minimum_wage: number; is_below_minimum: boolean; top_up_required: number }
}
type Anomaly = { type: string; pickerId: string; severity: string }

Deno.test({ name: 'check-compliance and detect-anomalies', ...testOpts, fn: async t => {
    try {
        const today = nzToday()
        const orchard = await makeOrchard({ piece_rate: 6.5 })
        const leader = await makeUser('team_leader', { orchardId: orchard })
        const worker = await makePicker(orchard)
        const early = await makePicker(orchard)
        const fast = await makePicker(orchard)
        const sharerA = await makePicker(orchard)
        const sharerB = await makePicker(orchard)

        // worker: 06:00–11:30 sin descanso anotado (5.5 h pagadas: no se descuenta), 2 cubetas
        must(await service.from('daily_attendance').insert({
            picker_id: worker.id, orchard_id: orchard, date: today,
            check_in: nzTime(today, '06:00'), check_out: nzTime(today, '11:30'), status: 'present',
        }), 'attendance')
        const scan = (pickerId: string, hhmm: string, extra: Record<string, unknown> = {}) =>
            ({ picker_id: pickerId, orchard_id: orchard, scanned_at: nzTime(today, hhmm), quality_grade: 'A', ...extra })
        const rows = [
            scan(worker.id, '07:00'), scan(worker.id, '08:00'),
            // early: escaneo a las 05:00 (fuera de turno 06–19)
            scan(early.id, '05:00'),
            // Compañeros en la misma fila con 1 minuto de diferencia: lo normal en
            // una cuadrilla, NO es anomalía. La misma persona dos veces en 20 s sí
            // (escaneo repetido o tarjeta compartida).
            scan(sharerA.id, '14:00', { row_number: 7 }), scan(sharerB.id, '14:01', { row_number: 7 }),
            { ...scan(sharerB.id, '14:01', { row_number: 7 }), scanned_at: new Date(Date.parse(nzTime(today, '14:01')) + 20_000).toISOString() },
        ]
        // fast: 20 cubetas en 10 minutos (físicamente imposible)
        const fastStart = new Date(nzTime(today, '10:00')).getTime()
        for (let i = 0; i < 20; i++) {
            rows.push({ picker_id: fast.id, orchard_id: orchard, quality_grade: 'A', scanned_at: new Date(fastStart + i * 30_000).toISOString() })
        }
        must(await service.from('bucket_records').insert(rows), 'buckets')

        await t.step('check-compliance: missed meal break and pay below the minimum', async () => {
            const r = await call<{ pickers: PickerCompliance[] }>('check-compliance', {
                token: leader.token, body: { orchard_id: orchard, picker_ids: [worker.id] },
            })
            assertEquals(r.status, 200, show(r))
            const p = r.json.pickers[0]
            assertEquals(p.metrics.hours_worked, 5.5)
            assertEquals(p.metrics.buckets_today, 2)
            assertEquals(p.metrics.effective_hourly_rate, 2.36)
            assert([23.95, 35.93].includes(p.metrics.minimum_wage), `min wage ${p.metrics.minimum_wage}`)
            assertEquals(p.metrics.is_below_minimum, true)
            assertAlmostEquals(p.metrics.top_up_required, 5.5 * p.metrics.minimum_wage - 13, 0.011)
            const kinds = p.violations.map(v => `${v.type}/${v.severity}`).sort()
            assertEquals(kinds, ['break_overdue/high', 'break_overdue/medium', 'wage_below_minimum/high'])
        })

        await t.step('check-compliance: a team leader or manager of another orchard is refused (403)', async () => {
            for (const role of ['team_leader', 'manager'] as const) {
                const r = await call<{ pickers: PickerCompliance[] }>('check-compliance', {
                    token: await seededToken(role), body: { orchard_id: orchard, picker_ids: [worker.id] },
                })
                assertEquals(r.status, 403, `${role}: ${show(r)}`)
                assert(!r.text.includes('hours_worked'), `${role}: no metrics in the refusal`)
            }
        })

        await t.step('detect-anomalies: off-hours, impossible velocity and double scan (NZ time)', async () => {
            const r = await call<{ anomalies: Anomaly[] }>('detect-anomalies', { token: leader.token, body: { orchard_id: orchard } })
            assertEquals(r.status, 200, show(r))
            const has = (type: string, pickerId: string) => r.json.anomalies.some(a => a.type === type && a.pickerId === pickerId)
            assert(has('off_hours', early.id), `05:00 NZ scan flagged: ${show(r)}`)
            assert(!has('off_hours', worker.id), '07:00/08:00 NZ scans are within the shift')
            assert(has('impossible_velocity', fast.id), 'fast picker flagged')
            assert(has('duplicate_proximity', sharerB.id), 'same person twice within 20 s flagged')
            assert(!has('duplicate_proximity', sharerA.id), 'a crew mate on the same row 1 min later is not an anomaly')
        })

        await t.step('detect-anomalies: another orchard\'s team leader sees none of it', async () => {
            const r = await call<{ anomalies: Anomaly[] }>('detect-anomalies', { token: await seededToken('team_leader'), body: { orchard_id: orchard } })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.anomalies.length, 0)
        })
    } finally {
        await cleanupAll()
    }
} })
