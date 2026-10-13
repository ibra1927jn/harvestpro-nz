/**
 * record-bucket: el libro de cubetas (de él sale la paga por pieza).
 *
 * Lote del móvil: saved / duplicate / rejected (+ motivo), el mismo id de
 * cliente dos veces = una sola fila, tarjeta → persona, día cerrado y semana
 * de pago cerrada rechazados, y un rechazo de permisos (otro huerto, persona
 * archivada) es definitivo: si volviera como "retry" el móvil lo reintentaría
 * para siempre.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, onCleanup, randomMonday,
    addDays, service, show, testOpts, seededToken,
} from './_helpers.ts'

type Result = { id: string | null; status: string; reason?: string }

async function sunriseOrchardId(): Promise<string> {
    // Huerto del seed (el de manager@/runner@)
    const { data } = must(await service.from('users').select('orchard_id').eq('email', 'manager@harvestpro.nz').single(), 'seed orchard')
    return data!.orchard_id as string
}

Deno.test({ name: 'record-bucket', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard()
        const otherOrchard = await makeOrchard()
        const runner = await makeUser('runner', { orchardId: orchard })
        const picker = await makePicker(orchard)
        const rotating = await makePicker(otherOrchard)   // trabaja hoy en otro huerto de la empresa
        const archived = await makePicker(orchard, { status: 'archived' })
        const seedOrchard = await sunriseOrchardId()
        const base = Date.now() - 60_000
        const at = (i: number) => new Date(base + i * 1000).toISOString()

        await t.step('batch: saved / duplicate / rejected with reasons; same client id twice = one row', async () => {
            const s1 = crypto.randomUUID()
            const scans = [
                { id: s1, picker_id: picker.badge, orchard_id: orchard, scanned_at: at(1), quality_grade: 'A' },
                { id: s1, picker_id: picker.badge, orchard_id: orchard, scanned_at: at(1), quality_grade: 'A' },
                { id: crypto.randomUUID(), picker_id: 'NO-SUCH-BADGE-' + crypto.randomUUID().slice(0, 4), orchard_id: orchard, scanned_at: at(2) },
                { id: crypto.randomUUID(), picker_id: picker.id, orchard_id: orchard, scanned_at: at(3), quality_grade: 'Z' },
                { id: crypto.randomUUID(), picker_id: picker.id, orchard_id: 'offline-orchard', scanned_at: at(4) },
                { id: crypto.randomUUID(), picker_id: rotating.badge, orchard_id: orchard, scanned_at: at(5) },
                { not_a: 'scan' },
            ]
            const r = await call('record-bucket', { token: runner.token, body: { scans } })
            assertEquals(r.status, 200, show(r))
            const res = r.json.results as Result[]
            assertEquals(res.map(x => x.status), ['saved', 'duplicate', 'rejected', 'rejected', 'rejected', 'saved', 'rejected'])
            assertStringIncludes(res[2].reason ?? '', 'UNKNOWN_BADGE')
            assertEquals(res[6].id, null)

            // Reenvío del mismo lote (el móvil no recibió la respuesta): nada nuevo
            const again = await call('record-bucket', { token: runner.token, body: { scans: [scans[0]] } })
            assertEquals((again.json.results as Result[])[0].status, 'duplicate')

            const { data } = must(await service.from('bucket_records').select('id, picker_id, scanned_by, orchard_id').eq('id', s1), 'read s1')
            assertEquals(data!.length, 1)
            assertEquals(data![0].picker_id, picker.id, 'badge resolved to the person')
            assertEquals(data![0].scanned_by, runner.id)

            // Tarjeta de alguien de otro huerto de la empresa: se resuelve igual
            const { data: rot } = must(await service.from('bucket_records').select('picker_id, orchard_id').eq('id', scans[5].id as string).single(), 'rot')
            assertEquals(rot!.picker_id, rotating.id)
            assertEquals(rot!.orchard_id, orchard)
        })

        await t.step('batch: a scan into another orchard is a permanent rejection, not retry', async () => {
            const id = crypto.randomUUID()
            const r = await call('record-bucket', {
                token: runner.token,
                body: { scans: [{ id, picker_id: picker.id, orchard_id: seedOrchard, scanned_at: at(10) }] },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals((r.json.results as Result[])[0].status, 'rejected', show(r))
            const { count } = await service.from('bucket_records').select('id', { count: 'exact', head: true }).eq('id', id)
            assertEquals(count, 0)
        })

        await t.step('batch: an archived person is a permanent rejection', async () => {
            const r = await call('record-bucket', {
                token: runner.token,
                body: { scans: [{ id: crypto.randomUUID(), picker_id: archived.badge, orchard_id: orchard, scanned_at: at(11) }] },
            })
            assertEquals((r.json.results as Result[])[0].status, 'rejected', show(r))
        })

        await t.step('closed day: scans after the closure are rejected, earlier offline scans are kept', async () => {
            const day = addDays(randomMonday(2023), 2)
            must(await service.from('day_closures').insert({
                orchard_id: orchard, date: day, status: 'closed', closed_at: nzTime(day, '12:00'),
            }), 'day_closures.insert')
            const before = { id: crypto.randomUUID(), picker_id: picker.badge, orchard_id: orchard, scanned_at: nzTime(day, '11:00') }
            const after = { id: crypto.randomUUID(), picker_id: picker.badge, orchard_id: orchard, scanned_at: nzTime(day, '13:00') }
            const r = await call('record-bucket', { token: runner.token, body: { scans: [before, after] } })
            const res = r.json.results as Result[]
            assertEquals(res[0].status, 'saved', show(r))
            assertEquals(res[1].status, 'rejected', show(r))
            assertStringIncludes(res[1].reason ?? '', 'INSERT_BLOCKED')
        })

        await t.step('closed pay week: scans in it are rejected (PAY_WEEK_CLOSED)', async () => {
            const monday = randomMonday(2022)
            must(await service.from('pay_weeks').insert({
                week_start: monday, week_end: addDays(monday, 6), status: 'closed',
                closed_at: new Date().toISOString(), snapshot: { eft: true }, total_earnings: 0,
            }), 'pay_weeks.insert')
            onCleanup(() => service.from('pay_weeks').delete().eq('week_start', monday))
            const r = await call('record-bucket', {
                token: runner.token,
                body: { scans: [{ id: crypto.randomUUID(), picker_id: picker.badge, orchard_id: orchard, scanned_at: nzTime(addDays(monday, 3), '10:00') }] },
            })
            const res = r.json.results as Result[]
            assertEquals(res[0].status, 'rejected', show(r))
            assertStringIncludes(res[0].reason ?? '', 'PAY_WEEK_CLOSED')
        })

        await t.step('single scan: badge resolved; unknown badge and other orchard → 400', async () => {
            const ok = await call('record-bucket', {
                token: runner.token,
                body: { picker_id: picker.badge, orchard_id: orchard, scanned_at: at(20), row_number: 3 },
            })
            assertEquals(ok.status, 200, show(ok))
            assertEquals(ok.json.picker_id, picker.id)
            assertEquals(ok.json.resolved_from_badge, true)
            const { data } = must(await service.from('bucket_records').select('row_number, scanned_by').eq('id', ok.json.id).single(), 'single')
            assertEquals(data!.row_number, 3)
            assertEquals(data!.scanned_by, runner.id)

            const unknown = await call('record-bucket', { token: runner.token, body: { picker_id: 'NOPE-' + crypto.randomUUID(), orchard_id: orchard } })
            assertEquals(unknown.status, 400, show(unknown))

            const foreign = await call('record-bucket', { token: runner.token, body: { picker_id: picker.id, orchard_id: seedOrchard, scanned_at: at(21) } })
            assertEquals(foreign.status, 400, show(foreign))
        })

        await t.step('seeded runner cannot record into a test orchard (orchard scoping)', async () => {
            const r = await call('record-bucket', {
                token: await seededToken('runner'),
                body: { picker_id: picker.id, orchard_id: orchard, scanned_at: at(30) },
            })
            assertEquals(r.status, 400, show(r))
            const { count } = await service.from('bucket_records').select('id', { count: 'exact', head: true })
                .eq('picker_id', picker.id).eq('scanned_at', at(30))
            assertEquals(count, 0)
        })

        await t.step('warmup returns without writing', async () => {
            const r = await call('record-bucket', { token: runner.token, body: { _warmup: true } })
            assertEquals(r.status, 200)
            assert(r.json.status === 'warm')
        })
    } finally {
        await cleanupAll()
    }
} })
