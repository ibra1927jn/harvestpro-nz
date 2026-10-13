/**
 * manage-attendance y approve-timesheet.
 *
 * - Quién verifica / corrige / aprueba es SIEMPRE quien llama (no un id del
 *   cuerpo): si no, cualquiera podría firmar en nombre de otro.
 * - Huertos: no se ficha a nadie en un huerto ajeno; al fichar en otro huerto
 *   se cierra el tramo abierto en el anterior (la gente rota).
 * - Una corrección que la base de datos no aplica (p. ej. el propio fichaje)
 *   no puede responder "success" ni dejar auditoría.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, nzToday, service, show, testOpts,
} from './_helpers.ts'

type CheckIn = { id: string; already_checked_in: boolean; closed_shift_id?: string | null }

Deno.test({ name: 'manage-attendance and approve-timesheet', ...testOpts, fn: async t => {
    try {
        const orchardT = await makeOrchard()
        const orchardU = await makeOrchard()
        const leaderT = await makeUser('team_leader', { orchardId: orchardT })
        const managerT = await makeUser('manager', { orchardId: orchardT })
        const leaderU = await makeUser('team_leader', { orchardId: orchardU })
        const picker = await makePicker(orchardT)
        const other = await makePicker(orchardT)
        const today = nzToday()

        let shiftT = ''
        await t.step('check_in: verified_by is the caller, not the body', async () => {
            const r = await call<CheckIn>('manage-attendance', {
                token: leaderT.token,
                body: { action: 'check_in', picker_id: picker.id, orchard_id: orchardT, verified_by: managerT.id },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.already_checked_in, false)
            shiftT = r.json.id
            const { data } = must(await service.from('daily_attendance').select('verified_by, orchard_id, date, check_out').eq('id', shiftT).single(), 'row')
            assertEquals(data!.verified_by, leaderT.id)
            assertEquals(data!.orchard_id, orchardT)
            assertEquals(data!.date, today)
            assertEquals(data!.check_out, null)

            const again = await call<CheckIn>('manage-attendance', {
                token: leaderT.token, body: { action: 'check_in', picker_id: picker.id, orchard_id: orchardT },
            })
            assertEquals(again.json.already_checked_in, true)
            assertEquals(again.json.id, shiftT)
        })

        await t.step('check_in into an orchard that is not yours → 403, nothing written (nor yourself)', async () => {
            const r = await call('manage-attendance', {
                token: leaderU.token, body: { action: 'check_in', picker_id: other.id, orchard_id: orchardT },
            })
            assertEquals(r.status, 403, show(r))
            const { count } = await service.from('daily_attendance').select('id', { count: 'exact', head: true }).eq('picker_id', other.id)
            assertEquals(count, 0)
            const self = await call('manage-attendance', {
                token: leaderT.token, body: { action: 'check_in', picker_id: leaderT.id, orchard_id: orchardT },
            })
            assertEquals(self.status, 403, show(self))
        })

        let shiftU = ''
        await t.step('team leader of another orchard checks in a rotating person: previous shift auto-closed', async () => {
            const r = await call<CheckIn>('manage-attendance', {
                token: leaderU.token, body: { action: 'check_in', picker_id: picker.id, orchard_id: orchardU },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.closed_shift_id, shiftT)
            shiftU = r.json.id
            const { data: prev } = must(await service.from('daily_attendance').select('check_out, notes').eq('id', shiftT).single(), 'prev')
            assertNotEquals(prev!.check_out, null)
            assert(String(prev!.notes).includes('Auto-closed'))
            const { data: now } = must(await service.from('daily_attendance').select('orchard_id, verified_by').eq('id', shiftU).single(), 'now')
            assertEquals(now!.orchard_id, orchardU)
            assertEquals(now!.verified_by, leaderU.id)
        })

        await t.step('check_out records the time and paid hours', async () => {
            const r = await call<{ check_out: string; hours_worked: number }>('manage-attendance', {
                token: leaderU.token, body: { action: 'check_out', attendance_id: shiftU },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(typeof r.json.hours_worked, 'number')
            const { data } = must(await service.from('daily_attendance').select('check_out').eq('id', shiftU).single(), 'out')
            assertNotEquals(data!.check_out, null)
        })

        await t.step('correct: corrected_by and audit author are the caller; hours recalculated', async () => {
            const r = await call('manage-attendance', {
                token: leaderT.token,
                body: {
                    action: 'correct', attendance_id: shiftT,
                    check_in: nzTime(today, '07:00'), check_out: nzTime(today, '15:30'),
                    reason: 'Forgot to check out on time', admin_id: managerT.id,
                },
            })
            assertEquals(r.status, 200, show(r))
            const { data } = must(await service.from('daily_attendance').select('corrected_by, hours_worked, correction_reason').eq('id', shiftT).single(), 'corr')
            assertEquals(data!.corrected_by, leaderT.id)
            assertEquals(Number(data!.hours_worked), 8) // 8.5 h − 30 min sin pagar
            const { data: audit } = must(await service.from('audit_logs').select('user_id')
                .eq('record_id', shiftT).eq('new_values->>event', 'timesheet_correction'), 'audit')
            assertEquals(audit!.map(a => a.user_id), [leaderT.id])
        })

        await t.step('correct: a change the database refuses (own timesheet) is not reported as success', async () => {
            // El team leader también es persona de campo: no puede tocar su propio fichaje
            const { data: own } = must(await service.from('daily_attendance').insert({
                picker_id: leaderT.id, orchard_id: orchardT, date: today,
                check_in: nzTime(today, '06:00'), check_out: nzTime(today, '07:00'), status: 'present',
            }).select('id').single(), 'own attendance')
            const r = await call('manage-attendance', {
                token: leaderT.token,
                body: { action: 'correct', attendance_id: own!.id, check_out: nzTime(today, '18:00'), reason: 'Give myself overtime', admin_id: leaderT.id },
            })
            assertEquals(r.status, 403, show(r))
            const { data } = must(await service.from('daily_attendance').select('check_out').eq('id', own!.id).single(), 'own')
            assertEquals(new Date(data!.check_out).toISOString(), nzTime(today, '07:00'))
            const { count } = await service.from('audit_logs').select('id', { count: 'exact', head: true })
                .eq('record_id', own!.id).eq('new_values->>event', 'timesheet_correction')
            assertEquals(count, 0, 'no audit row for a change that did not happen')
        })

        await t.step('correct: someone else\'s orchard (not visible) → rejected', async () => {
            const r = await call('manage-attendance', {
                token: leaderU.token,
                body: { action: 'correct', attendance_id: shiftT, check_out: nzTime(today, '20:00'), reason: 'not my orchard', admin_id: leaderU.id },
            })
            assertEquals(r.status, 400, show(r))
            const { data } = must(await service.from('daily_attendance').select('check_out').eq('id', shiftT).single(), 'row')
            assertEquals(new Date(data!.check_out).toISOString(), nzTime(today, '15:30'))
        })

        await t.step('approve-timesheet: approver is the caller, even if the body names someone else', async () => {
            const { data: before } = must(await service.from('daily_attendance').select('updated_at').eq('id', shiftT).single(), 'before')
            const r = await call<{ verified_by: string }>('approve-timesheet', {
                token: managerT.token,
                body: { attendance_id: shiftT, verified_by: leaderU.id, current_updated_at: before!.updated_at },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.verified_by, managerT.id)
            const { data } = must(await service.from('daily_attendance').select('verified_by').eq('id', shiftT).single(), 'after')
            assertEquals(data!.verified_by, managerT.id)
            const { data: audit } = must(await service.from('audit_logs').select('user_id, new_values')
                .eq('record_id', shiftT).eq('new_values->>event', 'timesheet_approved'), 'audit')
            assertEquals(audit!.length, 1)
            assertEquals(audit![0].user_id, managerT.id)
            assertEquals(audit![0].new_values.verified_by, managerT.id)
        })

        await t.step('approve-timesheet: what the Payroll screen sends (verified_by "current_user") works', async () => {
            // PayrollTabs.handleApprove manda verified_by: 'current_user'
            const r = await call('approve-timesheet', { token: managerT.token, body: { attendance_id: shiftU, verified_by: 'current_user' } })
            assertEquals(r.status, 200, show(r))
            const { data } = must(await service.from('daily_attendance').select('verified_by').eq('id', shiftU).single(), 'u')
            assertEquals(data!.verified_by, managerT.id)
        })

        await t.step('approve-timesheet: stale copy (optimistic lock) and unknown id → 400', async () => {
            const stale = await call('approve-timesheet', {
                token: managerT.token,
                body: { attendance_id: shiftT, current_updated_at: new Date(Date.now() - 3_600_000).toISOString() },
            })
            assertEquals(stale.status, 400, show(stale))
            const unknown = await call('approve-timesheet', { token: managerT.token, body: { attendance_id: crypto.randomUUID() } })
            assertEquals(unknown.status, 400, show(unknown))
        })
    } finally {
        await cleanupAll()
    }
} })
