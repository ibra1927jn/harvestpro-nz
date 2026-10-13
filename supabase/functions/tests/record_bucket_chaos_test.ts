/**
 * record-bucket bajo carrera: lotes repetidos en paralelo (el móvil reenvía
 * porque no le llegó la respuesta, dos pestañas, dos runners) y cubetas
 * distintas de la misma persona en el mismo segundo.
 *
 * Invariante: cada id de cliente queda exactamente una vez en bucket_records y
 * nada que el servidor dé por "saved"/"duplicate" falta en la tabla.
 *
 * CHAOS_ROUNDS=<n> sube el número de rondas (por defecto 3).
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    addDays, call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, onCleanup, randomMonday, service, show, testOpts,
} from './_helpers.ts'

type Result = { id: string | null; status: string; reason?: string }

const ROUNDS = Number(Deno.env.get('CHAOS_ROUNDS') ?? 3)

Deno.test({ name: 'record-bucket chaos', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard()
        const runnerA = await makeUser('runner', { orchardId: orchard })
        const runnerB = await makeUser('runner', { orchardId: orchard })
        const pickers = [await makePicker(orchard), await makePicker(orchard), await makePicker(orchard)]
        // Hora al segundo, como la guarda el móvil (toNZST)
        const second = (offset: number) => new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000 + offset * 1000).toISOString()

        await t.step('two different buckets of the same person in the same second are both stored', async () => {
            const at = second(1)
            const scans = [crypto.randomUUID(), crypto.randomUUID()].map(id => ({
                id, picker_id: pickers[0].badge, orchard_id: orchard, scanned_at: at, quality_grade: 'A',
            }))
            const r = await call('record-bucket', { token: runnerA.token, body: { scans } })
            assertEquals(r.status, 200, show(r))
            assertEquals((r.json.results as Result[]).map(x => x.status), ['saved', 'saved'], show(r))
            const { data } = must(await service.from('bucket_records').select('id').in('id', scans.map(s => s.id)), 'read')
            assertEquals(data!.length, 2, 'the second bucket was reported but not stored')

            // Reenvío del mismo lote: duplicate y sin filas nuevas
            const again = await call('record-bucket', { token: runnerA.token, body: { scans } })
            assertEquals((again.json.results as Result[]).map(x => x.status), ['duplicate', 'duplicate'], show(again))
            const { count } = await service.from('bucket_records').select('id', { count: 'exact', head: true }).eq('picker_id', pickers[0].id)
            assertEquals(count, 2)
        })

        await t.step('two runners scan the same person in the same second', async () => {
            const at = second(2)
            const a = { id: crypto.randomUUID(), picker_id: pickers[1].badge, orchard_id: orchard, scanned_at: at }
            const b = { id: crypto.randomUUID(), picker_id: pickers[1].badge, orchard_id: orchard, scanned_at: at }
            const [ra, rb] = await Promise.all([
                call('record-bucket', { token: runnerA.token, body: { scans: [a] } }),
                call('record-bucket', { token: runnerB.token, body: { scans: [b] } }),
            ])
            assertEquals((ra.json.results as Result[])[0].status, 'saved', show(ra))
            assertEquals((rb.json.results as Result[])[0].status, 'saved', show(rb))
            const { count } = await service.from('bucket_records').select('id', { count: 'exact', head: true }).in('id', [a.id, b.id])
            assertEquals(count, 2)
        })

        await t.step('resend of a scan saved before the pay week was closed is "duplicate", not "rejected"', async () => {
            // El móvil subió el lote, el servidor guardó, la respuesta no llegó;
            // payroll cierra la semana; el móvil reenvía. Antes: PAY_WEEK_CLOSED
            // (el trigger va antes que la clave única) y el runner veía rechazada
            // una cubeta que sí está pagada.
            const monday = randomMonday(2021)
            const scan = { id: crypto.randomUUID(), picker_id: pickers[2].badge, orchard_id: orchard, scanned_at: nzTime(addDays(monday, 2), '10:00') }
            const first = await call('record-bucket', { token: runnerA.token, body: { scans: [scan] } })
            assertEquals((first.json.results as Result[])[0].status, 'saved', show(first))
            must(await service.from('pay_weeks').insert({
                week_start: monday, week_end: addDays(monday, 6), status: 'closed',
                closed_at: new Date().toISOString(), snapshot: { eft: true }, total_earnings: 0,
            }), 'pay_weeks.insert')
            onCleanup(async () => {
                await service.from('pay_weeks').update({ status: 'open' }).eq('week_start', monday)
                await service.from('bucket_records').delete().eq('id', scan.id)
                await service.from('pay_weeks').delete().eq('week_start', monday)
            })
            const again = await call('record-bucket', { token: runnerA.token, body: { scans: [scan] } })
            assertEquals((again.json.results as Result[])[0].status, 'duplicate', show(again))
            // Una cubeta nueva en esa semana sí se rechaza
            const late = { ...scan, id: crypto.randomUUID(), scanned_at: nzTime(addDays(monday, 2), '11:00') }
            const r = await call('record-bucket', { token: runnerA.token, body: { scans: [late] } })
            assertEquals((r.json.results as Result[])[0].status, 'rejected', show(r))
        })

        await t.step(`same batch sent ${ROUNDS}x4 times in parallel (retries, two tabs): one row per id`, async () => {
            for (let round = 0; round < ROUNDS; round++) {
                const scans = Array.from({ length: 12 }, (_, i) => ({
                    id: crypto.randomUUID(),
                    picker_id: pickers[i % 3].badge,
                    orchard_id: orchard,
                    // Varias cubetas de la misma persona en el mismo segundo
                    scanned_at: second(10 + round * 10 + Math.floor(i / 6)),
                    quality_grade: 'A',
                }))
                // Cada envío lleva el lote en distinto orden, como reintentos parciales
                const shuffled = (k: number) => scans.map((_, i) => scans[(i + k * 5) % scans.length])
                const responses = await Promise.all([0, 1, 2, 3].map(k =>
                    call('record-bucket', { token: k % 2 ? runnerB.token : runnerA.token, body: { scans: shuffled(k) } })))
                const okIds = new Set<string>()
                for (const r of responses) {
                    assertEquals(r.status, 200, show(r))
                    for (const x of r.json.results as Result[]) {
                        if (x.status === 'saved' || x.status === 'duplicate') okIds.add(x.id as string)
                        else throw new Error(`unexpected ${x.status}: ${x.reason}`)
                    }
                }
                assertEquals(okIds.size, scans.length)
                const { data } = must(await service.from('bucket_records').select('id').in('id', scans.map(s => s.id)), 'read round')
                assertEquals(data!.length, scans.length, `round ${round}: rows != ids`)
                // Exactamente un "saved" por id entre todos los envíos
                const savedCount = responses.flatMap(r => r.json.results as Result[]).filter(x => x.status === 'saved').length
                assertEquals(savedCount, scans.length, `round ${round}: an id was saved twice or never`)
            }
        })
    } finally {
        await cleanupAll()
    }
} })
