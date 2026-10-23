/**
 * manage-attendance desde la cola sin red del pase de lista:
 *
 * - check_in con el id generado en el móvil (client_id) y la hora del móvil
 *   (at): reintentar no duplica el turno.
 * - Una hora del móvil demasiado lejos de la del servidor → 422 (va a la cola de fallidos).
 * - Descanso: inicio y fin desde el pase de lista, idempotentes; uno por tramo.
 * - check_out repetido no cambia la salida; si el tramo del móvil no existe se
 *   usa el abierto de esa persona.
 * - Las mismas reglas de alcance que el resto (otro equipo → 403).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { call, cleanupAll, makeOrchard, makePicker, makeUser, must, service, show, testOpts } from './_helpers.ts'

type Shift = { id: string; already_checked_in?: boolean; already_checked_out?: boolean; already?: boolean; server_time?: string; break_minutes?: number }

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

Deno.test({ name: 'manage-attendance offline roll call and breaks', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard()
        const leader = await makeUser('team_leader', { orchardId: orchard })
        const otherLeader = await makeUser('team_leader', { orchardId: orchard })
        const picker = await makePicker(orchard)
        const second = await makePicker(orchard)
        const foreign = await makePicker(orchard)
        must(await service.from('pickers').update({ team_leader_id: leader.id }).in('id', [picker.id, second.id]), 'team')
        must(await service.from('pickers').update({ team_leader_id: otherLeader.id }).eq('id', foreign.id), 'other team')
        const clientId = crypto.randomUUID()
        const checkInAt = minutesAgo(240)

        await t.step('check_in with the phone id and time; retrying returns the same shift', async () => {
            const body = { action: 'check_in', picker_id: picker.id, orchard_id: orchard, client_id: clientId, at: checkInAt }
            const r = await call<Shift>('manage-attendance', { token: leader.token, body })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.id, clientId)
            assert(r.json.server_time, 'server_time for clock skew')
            const again = await call<Shift>('manage-attendance', { token: leader.token, body })
            assertEquals(again.status, 200, show(again))
            assertEquals(again.json.id, clientId)
            assertEquals(again.json.already_checked_in, true)
            const { data } = must(await service.from('daily_attendance').select('id, check_in').eq('picker_id', picker.id), 'rows')
            assertEquals(data!.length, 1)
            assertEquals(Date.parse(data![0].check_in), Date.parse(checkInAt))
        })

        await t.step('a phone time far from the server time is refused (422)', async () => {
            const r = await call('manage-attendance', {
                token: leader.token,
                body: { action: 'check_in', picker_id: second.id, orchard_id: orchard, client_id: crypto.randomUUID(), at: minutesAgo(3 * 24 * 60) },
            })
            assertEquals(r.status, 422, show(r))
            assert(r.text.includes('TIME_OUT_OF_RANGE'))
        })

        await t.step('break start and end from the roll call, both idempotent', async () => {
            const start = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'break_start', attendance_id: clientId, at: minutesAgo(120) },
            })
            assertEquals(start.status, 200, show(start))
            const startAgain = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'break_start', attendance_id: clientId, at: minutesAgo(119) },
            })
            assertEquals(startAgain.json.already, true, show(startAgain))
            const end = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'break_end', attendance_id: clientId, at: minutesAgo(80) },
            })
            assertEquals(end.status, 200, show(end))
            assertEquals(end.json.break_minutes, 40)
            const endAgain = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'break_end', attendance_id: clientId, at: minutesAgo(10) },
            })
            assertEquals(endAgain.json.already, true)
            assertEquals(endAgain.json.break_minutes, 40)
        })

        await t.step('only one meal break per shift (409)', async () => {
            const r = await call('manage-attendance', {
                token: leader.token, body: { action: 'break_start', attendance_id: clientId },
            })
            assertEquals(r.status, 409, show(r))
        })

        await t.step('check_out with the phone time; a retry does not move it', async () => {
            const at = minutesAgo(5)
            const r = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'check_out', attendance_id: clientId, at },
            })
            assertEquals(r.status, 200, show(r))
            const again = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'check_out', attendance_id: clientId, at: minutesAgo(1) },
            })
            assertEquals(again.json.already_checked_out, true, show(again))
            const { data } = must(await service.from('daily_attendance').select('check_out, hours_worked').eq('id', clientId).single(), 'row')
            assertEquals(Date.parse(data!.check_out), Date.parse(at))
            // 235 min - 40 min de descanso
            assertEquals(Number(data!.hours_worked), 3.25)
        })

        await t.step('the phone shift id was never created: the open shift of that person is used', async () => {
            const open = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'check_in', picker_id: second.id, orchard_id: orchard },
            })
            assertEquals(open.status, 200, show(open))
            const r = await call<Shift>('manage-attendance', {
                token: leader.token, body: { action: 'check_out', attendance_id: crypto.randomUUID(), picker_id: second.id },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.id, open.json.id)
        })

        await t.step('another team: breaks are out of scope (403)', async () => {
            const own = await call<Shift>('manage-attendance', {
                token: otherLeader.token, body: { action: 'check_in', picker_id: foreign.id, orchard_id: orchard },
            })
            assertEquals(own.status, 200, show(own))
            const r = await call('manage-attendance', {
                token: leader.token, body: { action: 'break_start', attendance_id: own.json.id },
            })
            assertEquals(r.status, 403, show(r))
        })
    } finally {
        await cleanupAll()
    }
} })
