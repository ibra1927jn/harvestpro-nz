/**
 * manage-attendance y approve-timesheet.
 *
 * - Quién ficha / corrige / aprueba / rechaza es SIEMPRE quien llama (no un id
 *   del cuerpo): si no, cualquiera podría firmar en nombre de otro.
 * - Nómina (payroll_admin) aprueba y rechaza en cualquier huerto; manager solo
 *   en el suyo; semana de pago cerrada → 409.
 * - Huertos: no se ficha a nadie en un huerto ajeno; al fichar en otro huerto
 *   se cierra el tramo abierto en el anterior (la gente rota).
 * - Una corrección que la base de datos no aplica (p. ej. el propio fichaje)
 *   no puede responder "success" ni dejar auditoría.
 * - Alcance de las correcciones: el team leader solo corrige a SU equipo
 *   (pickers.team_leader_id); el manager, el huerto entero.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    addDays, call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, nzToday, onCleanup, randomMonday,
    seededId, seededToken, service, show, testOpts,
} from './_helpers.ts'

/** Día NZ n días antes (YYYY-MM-DD) */
function nzDayBefore(day: string, n: number): string {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
}

type CheckIn = { id: string; already_checked_in: boolean; closed_shift_id?: string | null }

Deno.test({ name: 'manage-attendance and approve-timesheet', ...testOpts, fn: async t => {
    try {
        const orchardT = await makeOrchard()
        const orchardU = await makeOrchard()
        const leaderT = await makeUser('team_leader', { orchardId: orchardT })
        const managerT = await makeUser('manager', { orchardId: orchardT })
        const leaderU = await makeUser('team_leader', { orchardId: orchardU })
        // El team leader solo ficha a su equipo o a gente sin equipo (A2): quien
        // recibe en U a alguien del equipo de leaderT es el manager de U
        const managerU = await makeUser('manager', { orchardId: orchardU })
        // `picker` es del equipo de leaderT; `other` no tiene equipo
        const picker = await makePicker(orchardT)
        must(await service.from('pickers').update({ team_leader_id: leaderT.id }).eq('id', picker.id), 'picker.team')
        const other = await makePicker(orchardT)
        const today = nzToday()

        let shiftT = ''
        await t.step('check_in: recorded_by is the caller, not the body; not approved yet', async () => {
            const r = await call<CheckIn>('manage-attendance', {
                token: leaderT.token,
                body: { action: 'check_in', picker_id: picker.id, orchard_id: orchardT, verified_by: managerT.id },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.already_checked_in, false)
            shiftT = r.json.id
            const { data } = must(await service.from('daily_attendance').select('recorded_by, verified_by, orchard_id, date, check_out').eq('id', shiftT).single(), 'row')
            assertEquals(data!.recorded_by, leaderT.id)
            // Aprobar es cosa de nómina/manager (antes nacía "aprobada" por quien fichaba)
            assertEquals(data!.verified_by, null)
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
        await t.step('manager of another orchard checks in a rotating person: previous shift auto-closed', async () => {
            const r = await call<CheckIn>('manage-attendance', {
                token: managerU.token, body: { action: 'check_in', picker_id: picker.id, orchard_id: orchardU },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.closed_shift_id, shiftT)
            shiftU = r.json.id
            const { data: prev } = must(await service.from('daily_attendance').select('check_out, notes').eq('id', shiftT).single(), 'prev')
            assertNotEquals(prev!.check_out, null)
            assert(String(prev!.notes).includes('Auto-closed'))
            const { data: now } = must(await service.from('daily_attendance').select('orchard_id, recorded_by, verified_by').eq('id', shiftU).single(), 'now')
            assertEquals(now!.orchard_id, orchardU)
            assertEquals(now!.recorded_by, managerU.id)
            assertEquals(now!.verified_by, null)
        })

        await t.step('check_out records the time and paid hours', async () => {
            const r = await call<{ check_out: string; hours_worked: number }>('manage-attendance', {
                token: managerU.token, body: { action: 'check_out', attendance_id: shiftU },
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
            assertEquals(Number(data!.hours_worked), 8.5) // 8.5 h; sin descanso anotado no se descuenta nada
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

        await t.step('correct: someone else\'s orchard → rejected (403: out of scope)', async () => {
            const r = await call('manage-attendance', {
                token: leaderU.token,
                body: { action: 'correct', attendance_id: shiftT, check_out: nzTime(today, '20:00'), reason: 'not my orchard', admin_id: leaderU.id },
            })
            assertEquals(r.status, 403, show(r))
            const { data } = must(await service.from('daily_attendance').select('check_out').eq('id', shiftT).single(), 'row')
            assertEquals(new Date(data!.check_out).toISOString(), nzTime(today, '15:30'))
        })

        type BatchResult = {
            success: boolean; total: number; succeeded: number; failed: number
            results: { index: number; attendance_id: string; success: boolean; error?: string }[]
        }
        let notMine = ''
        await t.step('correct_batch: the same correction on N timesheets, one audit row each, per-item errors do not abort the batch', async () => {
            // Dos fichajes de ayer en el huerto T, sin salida: uno de MI equipo y uno
            // de alguien sin equipo (el TL puede coger a gente sin equipo)
            const yesterday = addDays(today, -1)
            const p2 = await makePicker(orchardT)
            const { data: rows } = must(await service.from('daily_attendance').insert([
                { picker_id: picker.id, orchard_id: orchardT, date: yesterday, check_in: nzTime(yesterday, '07:00'), status: 'present' },
                { picker_id: p2.id, orchard_id: orchardT, date: yesterday, check_in: nzTime(yesterday, '07:10'), status: 'present' },
            ]).select('id'), 'batch rows')
            const [a, b] = rows!.map(r => r.id as string)
            // El tercero es el fichaje del propio team leader: se rechaza (fila sin tocar)
            const { data: own } = must(await service.from('daily_attendance').insert({
                picker_id: leaderT.id, orchard_id: orchardT, date: yesterday,
                check_in: nzTime(yesterday, '06:00'), status: 'present',
            }).select('id').single(), 'own batch row')
            // El cuarto es de alguien del huerto de OTRO equipo: fuera del alcance del TL
            const leaderT2 = await makeUser('team_leader', { orchardId: orchardT, login: false })
            const rival = await makePicker(orchardT)
            must(await service.from('pickers').update({ team_leader_id: leaderT2.id }).eq('id', rival.id), 'rival.team')
            const { data: foreign } = must(await service.from('daily_attendance').insert({
                picker_id: rival.id, orchard_id: orchardT, date: yesterday,
                check_in: nzTime(yesterday, '07:30'), status: 'present',
            }).select('id').single(), 'not-my-team row')
            notMine = foreign!.id

            const r = await call<BatchResult>('manage-attendance', {
                token: leaderT.token,
                body: {
                    action: 'correct_batch',
                    reason: 'Everyone forgot to check out',
                    items: [
                        { attendance_id: a, check_out: nzTime(yesterday, '16:30'), break_start: nzTime(yesterday, '12:00') },
                        { attendance_id: b, check_out: nzTime(yesterday, '16:30'), break_start: nzTime(yesterday, '12:00') },
                        { attendance_id: own!.id, check_out: nzTime(yesterday, '18:00') },
                        { attendance_id: notMine, check_out: nzTime(yesterday, '16:30') },
                    ],
                },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.total, 4)
            assertEquals(r.json.succeeded, 2)
            assertEquals(r.json.failed, 2)
            assertEquals(r.json.success, false)
            assertEquals(r.json.results.map(x => x.success), [true, true, false, false])
            assertEquals(r.json.results[2].attendance_id, own!.id)
            assertEquals(r.json.results[3].attendance_id, notMine)
            assert(String(r.json.results[3].error).includes('own team'), show(r))
            // El de otro equipo no cambia
            const { data: foreignRow } = must(await service.from('daily_attendance').select('check_out').eq('id', notMine).single(), 'foreign')
            assertEquals(foreignRow!.check_out, null)

            // Las dos filas corregidas: salida, descanso, horas (9.5 h − 0.5 h) y quién corrigió
            const { data: fixed } = must(await service.from('daily_attendance')
                .select('id, check_out, break_start, hours_worked, corrected_by, correction_reason').in('id', [a, b]), 'fixed')
            assertEquals(fixed!.length, 2)
            for (const row of fixed!) {
                assertEquals(new Date(row.check_out).toISOString(), nzTime(yesterday, '16:30'))
                assertNotEquals(row.break_start, null)
                assertEquals(row.corrected_by, leaderT.id)
                assertEquals(row.correction_reason, 'Everyone forgot to check out')
            }
            // 07:00–16:30 = 9.5 h menos el descanso de 30 min anotado
            assertEquals(Number(fixed!.find(x => x.id === a)!.hours_worked), 9)
            // El fichaje propio no cambia y no deja auditoría
            const { data: ownRow } = must(await service.from('daily_attendance').select('check_out').eq('id', own!.id).single(), 'own')
            assertEquals(ownRow!.check_out, null)
            const { data: audit } = must(await service.from('audit_logs').select('record_id, user_id, new_values')
                .in('record_id', [a, b, own!.id, notMine]).eq('new_values->>event', 'timesheet_correction'), 'audit')
            assertEquals(audit!.map(x => x.record_id).sort(), [a, b].sort())
            assertEquals(audit!.every(x => x.user_id === leaderT.id && x.new_values.reason === 'Everyone forgot to check out'), true)
        })

        await t.step('correct: another team\'s timesheet is out of the team leader\'s scope (403); the manager corrects the whole orchard', async () => {
            const yesterday = addDays(today, -1)
            const tl = await call('manage-attendance', {
                token: leaderT.token,
                body: { action: 'correct', attendance_id: notMine, check_out: nzTime(yesterday, '16:30'), reason: 'Not my team but same orchard' },
            })
            assertEquals(tl.status, 403, show(tl))
            const { data: still } = must(await service.from('daily_attendance').select('check_out').eq('id', notMine).single(), 'still')
            assertEquals(still!.check_out, null)

            const mgr = await call('manage-attendance', {
                token: managerT.token,
                body: { action: 'correct', attendance_id: notMine, check_out: nzTime(yesterday, '16:30'), reason: 'Manager fixes the whole orchard' },
            })
            assertEquals(mgr.status, 200, show(mgr))
            const { data: fixed } = must(await service.from('daily_attendance').select('check_out, corrected_by').eq('id', notMine).single(), 'fixed')
            assertEquals(new Date(fixed!.check_out).toISOString(), nzTime(yesterday, '16:30'))
            assertEquals(fixed!.corrected_by, managerT.id)
        })

        await t.step('correct_batch: validation (empty batch, short reason) → 400 without touching anything', async () => {
            const empty = await call('manage-attendance', {
                token: leaderT.token, body: { action: 'correct_batch', reason: 'Nothing here', items: [] },
            })
            assertEquals(empty.status, 400, show(empty))
            const short = await call('manage-attendance', {
                token: leaderT.token, body: { action: 'correct_batch', reason: 'x', items: [{ attendance_id: shiftT, check_out: nzTime(today, '20:00') }] },
            })
            assertEquals(short.status, 400, show(short))
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

        await t.step('approve-timesheet: a manager cannot review another orchard', async () => {
            const r = await call('approve-timesheet', { token: managerT.token, body: { attendance_id: shiftU } })
            assertEquals(r.status, 403, show(r))
            const { data } = must(await service.from('daily_attendance').select('verified_by').eq('id', shiftU).single(), 'u')
            assertEquals(data!.verified_by, null)
        })

        await t.step('approve-timesheet: payroll_admin approves in ANY orchard (what the Payroll screen sends)', async () => {
            // TimesheetsTab.handleApprove manda verified_by: 'current_user'
            const payrollId = await seededId('payroll_admin')
            const r = await call<{ verified_by: string }>('approve-timesheet', {
                token: await seededToken('payroll_admin'), body: { attendance_id: shiftU, verified_by: 'current_user' },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.verified_by, payrollId)
            const { data } = must(await service.from('daily_attendance').select('verified_by').eq('id', shiftU).single(), 'u')
            assertEquals(data!.verified_by, payrollId)
        })

        await t.step('approve-timesheet: payroll_admin rejects; the rejecter is the caller and it is audited', async () => {
            const payrollId = await seededId('payroll_admin')
            const r = await call<{ rejected_by: string; verified_by: string | null }>('approve-timesheet', {
                token: await seededToken('payroll_admin'),
                body: { attendance_id: shiftU, decision: 'reject', reason: 'Break time missing', verified_by: managerT.id },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.rejected_by, payrollId)
            const { data } = must(await service.from('daily_attendance')
                .select('verified_by, rejected_by, rejection_reason').eq('id', shiftU).single(), 'u')
            assertEquals(data!.verified_by, null)
            assertEquals(data!.rejected_by, payrollId)
            assertEquals(data!.rejection_reason, 'Break time missing')
            const { data: audit } = must(await service.from('audit_logs').select('user_id, new_values')
                .eq('record_id', shiftU).eq('new_values->>event', 'timesheet_rejected'), 'audit')
            assertEquals(audit!.length, 1)
            assertEquals(audit![0].user_id, payrollId)
            assertEquals(audit![0].new_values.reason, 'Break time missing')
        })

        await t.step('approve-timesheet: a closed pay week cannot be approved or rejected (409)', async () => {
            // Semana de un año lejano: cerrarla no afecta a nada más
            const monday = randomMonday(2019)
            const { data: att } = must(await service.from('daily_attendance').insert({
                picker_id: other.id, orchard_id: orchardT, date: monday,
                check_in: nzTime(monday, '07:00'), check_out: nzTime(monday, '15:00'), status: 'present',
            }).select('id').single(), 'closed-week attendance')
            const { data: week } = must(await service.from('pay_weeks').insert({
                week_start: monday, week_end: addDays(monday, 6), status: 'closed', closed_at: new Date().toISOString(), snapshot: {},
            }).select('id').single(), 'pay_weeks.insert')
            onCleanup(async () => {
                await service.from('pay_weeks').delete().eq('id', week!.id)
                await service.from('daily_attendance').delete().eq('id', att!.id)
            })
            for (const decision of ['approve', 'reject']) {
                const r = await call('approve-timesheet', {
                    token: await seededToken('payroll_admin'), body: { attendance_id: att!.id, decision, reason: 'Check the hours' },
                })
                assertEquals(r.status, 409, `${decision}: ${show(r)}`)
                assert(r.text.includes('PAY_WEEK_CLOSED'), show(r))
            }
            const { data } = must(await service.from('daily_attendance').select('verified_by, rejected_at').eq('id', att!.id).single(), 'cw')
            assertEquals(data!.verified_by, null)
            assertEquals(data!.rejected_at, null)
        })

        await t.step('team leader: another team\'s person → 403, nothing written (check_in and correct)', async () => {
            const leaderT2 = await makeUser('team_leader', { orchardId: orchardT })
            const teamed = await makePicker(orchardT)
            must(await service.from('pickers').update({ team_leader_id: leaderT2.id }).eq('id', teamed.id), 'assign team')
            const inR = await call('manage-attendance', {
                token: leaderT.token, body: { action: 'check_in', picker_id: teamed.id, orchard_id: orchardT },
            })
            assertEquals(inR.status, 403, show(inR))
            assert(inR.text.includes('own team'), show(inR))
            const { count } = await service.from('daily_attendance').select('id', { count: 'exact', head: true }).eq('picker_id', teamed.id)
            assertEquals(count, 0)

            const { data: att } = must(await service.from('daily_attendance').insert({
                picker_id: teamed.id, orchard_id: orchardT, date: today,
                check_in: nzTime(today, '07:00'), check_out: nzTime(today, '15:00'), status: 'present',
            }).select('id').single(), 'teamed attendance')
            const corr = await call('manage-attendance', {
                token: leaderT.token,
                body: { action: 'correct', attendance_id: att!.id, check_out: nzTime(today, '18:00'), reason: 'Not my team' },
            })
            assertEquals(corr.status, 403, show(corr))
            const out = await call('manage-attendance', { token: leaderT.token, body: { action: 'check_out', attendance_id: att!.id } })
            assertEquals(out.status, 403, show(out))
            const { data } = must(await service.from('daily_attendance').select('check_out').eq('id', att!.id).single(), 'teamed')
            assertEquals(new Date(data!.check_out).toISOString(), nzTime(today, '15:00'))
            // Su team leader sí
            const own = await call('manage-attendance', {
                token: leaderT2.token,
                body: { action: 'correct', attendance_id: att!.id, check_out: nzTime(today, '16:00'), reason: 'Left at four' },
            })
            assertEquals(own.status, 200, show(own))
        })

        await t.step('a correction after approval sends the timesheet back to pending', async () => {
            const { data: before } = must(await service.from('daily_attendance').select('verified_by').eq('id', shiftT).single(), 'b')
            assertEquals(before!.verified_by, managerT.id)
            const r = await call('manage-attendance', {
                token: leaderT.token,
                body: { action: 'correct', attendance_id: shiftT, check_out: nzTime(today, '15:45'), reason: 'Real check-out time' },
            })
            assertEquals(r.status, 200, show(r))
            const { data } = must(await service.from('daily_attendance').select('verified_by, verified_at').eq('id', shiftT).single(), 'a')
            assertEquals(data!.verified_by, null)
            assertEquals(data!.verified_at, null)
        })

        await t.step('approve-timesheet: an open shift cannot be approved (409); a rejection needs a reason (400)', async () => {
            const { data: open } = must(await service.from('daily_attendance').insert({
                picker_id: other.id, orchard_id: orchardT, date: today, check_in: nzTime(today, '07:00'), status: 'present',
            }).select('id').single(), 'open shift')
            const r = await call('approve-timesheet', { token: await seededToken('payroll_admin'), body: { attendance_id: open!.id } })
            assertEquals(r.status, 409, show(r))
            assert(r.text.includes('SHIFT_OPEN'), show(r))
            const noReason = await call('approve-timesheet', {
                token: await seededToken('payroll_admin'), body: { attendance_id: open!.id, decision: 'reject' },
            })
            assertEquals(noReason.status, 400, show(noReason))
            const { data } = must(await service.from('daily_attendance').select('verified_by, rejected_at').eq('id', open!.id).single(), 'open')
            assertEquals(data!.verified_by, null)
            assertEquals(data!.rejected_at, null)
        })

        await t.step('approve-timesheet: a shift over 14 h is not approved until corrected (409 LONG_SHIFT)', async () => {
            const day = nzDayBefore(today, 2)
            const { data: long } = must(await service.from('daily_attendance').insert({
                picker_id: other.id, orchard_id: orchardT, date: day,
                check_in: nzTime(day, '05:00'), check_out: nzTime(day, '21:00'), status: 'present',
            }).select('id').single(), 'long shift')
            const token = await seededToken('payroll_admin')
            const r = await call('approve-timesheet', { token, body: { attendance_id: long!.id } })
            assertEquals(r.status, 409, show(r))
            assert(r.text.includes('LONG_SHIFT'), show(r))
            // Corregida (el manager confirma el día largo): ya se aprueba
            const fix = await call('manage-attendance', {
                token: managerT.token,
                body: { action: 'correct', attendance_id: long!.id, check_out: nzTime(day, '20:30'), reason: 'Long day confirmed by the crew' },
            })
            assertEquals(fix.status, 200, show(fix))
            const { data: fixed } = must(await service.from('daily_attendance').select('hours_worked').eq('id', long!.id).single(), 'fixed')
            assertEquals(Number(fixed!.hours_worked), 15.5)
            const ok = await call('approve-timesheet', { token, body: { attendance_id: long!.id } })
            assertEquals(ok.status, 200, show(ok))
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
