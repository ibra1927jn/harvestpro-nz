/**
 * close-pay-week: solo payroll_admin y admin cierran / reabren; no se cierra
 * con horas estimadas ni con tramos sin aprobar; al cerrar se
 * guarda la foto de la nómina y calculate-payroll devuelve esa foto (no
 * cambia aunque cambien tarifas); la semana cerrada no admite cambios.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { PayrollResult } from '../_shared/payroll-calc.ts'
import {
    addDays, call, cleanupAll, makeOrchard, makePicker, makeUser, must, nzTime, nzToday, onCleanup, randomMonday,
    seededToken, service, show, testOpts,
} from './_helpers.ts'

Deno.test({ name: 'close-pay-week', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard({ piece_rate: 5 })
        const payroll = await makeUser('payroll_admin', { orchardId: orchard })
        const admin = await makeUser('admin', { orchardId: orchard })
        const manager = await makeUser('manager', { orchardId: orchard })
        const leader = await makeUser('team_leader', { orchardId: orchard })
        const picker = await makePicker(orchard)
        const late = await makePicker(orchard)

        const monday = randomMonday(2021)
        const sunday = addDays(monday, 6)
        const tue = addDays(monday, 1)
        onCleanup(() => service.from('pay_weeks').delete().eq('week_start', monday))

        // 8 h (08:00–16:30 con descanso anotado), 20 cubetas × 5 = 100 → complemento a 191.60
        const { data: att } = must(await service.from('daily_attendance').insert({
            picker_id: picker.id, orchard_id: orchard, date: tue,
            check_in: nzTime(tue, '08:00'), check_out: nzTime(tue, '16:30'), status: 'present', break_start: nzTime(tue, '12:00'),
        }).select('id').single(), 'attendance')
        const start = new Date(nzTime(tue, '08:10')).getTime()
        must(await service.from('bucket_records').insert(Array.from({ length: 20 }, (_, i) => ({
            picker_id: picker.id, orchard_id: orchard, quality_grade: 'A',
            scanned_at: new Date(start + i * 20 * 60_000).toISOString(),
        }))), 'buckets')

        let lateId = ''
        const body = (action: string, extra: Record<string, unknown> = {}) => ({ action, week_start: monday, ...extra })
        /** Respuesta de close-pay-week */
        type CloseResult = { closed?: boolean; reason?: string; pending?: { picker_id: string; issues?: { date: string; issue: string }[] }[]; total_earnings?: number; already_closed?: boolean }
        const payrollOf = (token: string) => call<PayrollResult & { closed?: unknown }>('calculate-payroll', { token, body: { start_date: monday, end_date: sunday } })

        await t.step('only payroll_admin / admin may close', async () => {
            for (const token of [manager.token, await seededToken('hr_admin'), await seededToken('manager')]) {
                const r = await call('close-pay-week', { token, body: body('close') })
                assertEquals(r.status, 403, show(r))
            }
            const { count } = await service.from('pay_weeks').select('id', { count: 'exact', head: true }).eq('week_start', monday)
            assertEquals(count, 0)
        })

        await t.step('rejects weeks not finished yet and non-Monday starts', async () => {
            const thisMonday = (await call('close-pay-week', { token: payroll.token, body: { action: 'status', week_start: monday } })).json
            assertEquals(thisMonday.pay_week, null)
            // Lunes de la semana en curso (NZ)
            const today = nzToday()
            const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
            const current = await call('close-pay-week', { token: payroll.token, body: { action: 'close', week_start: addDays(today, -dow) } })
            assertEquals(current.status, 400, show(current))
            assertStringIncludes(current.text, 'WEEK_NOT_FINISHED')
            const tuesday = await call('close-pay-week', { token: payroll.token, body: body('close', { week_start: tue }) })
            assertEquals(tuesday.status, 400, show(tuesday))
        })

        await t.step('will not close with estimated hours (open shift)', async () => {
            const { data: open } = must(await service.from('daily_attendance').insert({
                picker_id: late.id, orchard_id: orchard, date: tue, check_in: nzTime(tue, '09:00'), status: 'present',
            }).select('id').single(), 'open shift')
            must(await service.from('bucket_records').insert({
                picker_id: late.id, orchard_id: orchard, scanned_at: nzTime(tue, '10:00'), quality_grade: 'A',
            }), 'late bucket')
            const r = await call<CloseResult>('close-pay-week', { token: payroll.token, body: body('close') })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.closed, false)
            assertEquals(r.json.reason, 'ESTIMATED_HOURS')
            assertEquals(r.json.pending?.map(p => p.picker_id), [late.id])
            // Se corrige la hoja de horas (salida real) antes de cerrar
            must(await service.from('daily_attendance').update({ check_out: nzTime(tue, '10:30') }).eq('id', open!.id), 'close shift')
            lateId = open!.id
        })

        await t.step('will not close until every shift is approved (no hour is paid without review)', async () => {
            const review = (id: string, decision: 'approve' | 'reject', reason?: string) =>
                call('approve-timesheet', { token: payroll.token, body: { attendance_id: id, decision, ...(reason ? { reason } : {}) } })

            const before = await call<CloseResult>('close-pay-week', { token: payroll.token, body: body('close') })
            assertEquals(before.status, 200, show(before))
            assertEquals(before.json.closed, false)
            assertEquals(before.json.reason, 'UNREVIEWED_HOURS')
            assertEquals(before.json.pending?.map(p => p.picker_id).sort(), [picker.id, late.id].sort())
            assertEquals(before.json.pending?.flatMap(p => (p.issues ?? []).map(i => i.issue)), ['not_approved', 'not_approved'])

            // Uno aprobado y el otro rechazado: sigue sin cerrar
            assertEquals((await review(att!.id, 'approve')).status, 200)
            assertEquals((await review(lateId, 'reject', 'Check-out time is wrong')).status, 200)
            const rejected = await call<CloseResult>('close-pay-week', { token: payroll.token, body: body('close') })
            assertEquals(rejected.json.reason, 'UNREVIEWED_HOURS', show(rejected))
            assertEquals(rejected.json.pending?.map(p => [p.picker_id, (p.issues ?? []).map(i => i.issue)]), [[late.id, ['rejected']]])
            const { count } = await service.from('pay_weeks').select('id', { count: 'exact', head: true }).eq('week_start', monday)
            assertEquals(count, 0)

            // Corregido y aprobado: ya se puede cerrar
            assertEquals((await review(lateId, 'approve')).status, 200)
        })

        let closedTotal = 0
        await t.step('close: snapshot stored, closed_by = caller, audit row', async () => {
            const r = await call<CloseResult>('close-pay-week', { token: payroll.token, body: body('close') })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.closed, true)
            // 191.60 (8 h) + late: 1.5 h × 23.95 = 35.925 → 35.93
            assertEquals(r.json.total_earnings, 227.53)
            closedTotal = r.json.total_earnings ?? -1
            const { data: pw } = must(await service.from('pay_weeks').select('id, status, closed_by, snapshot, total_earnings').eq('week_start', monday).single(), 'pw')
            assertEquals(pw!.status, 'closed')
            assertEquals(pw!.closed_by, payroll.id)
            assertEquals(Number(pw!.total_earnings), 227.53)
            assertEquals(pw!.snapshot.summary.total_earnings, 227.53)
            const { count } = await service.from('audit_logs').select('id', { count: 'exact', head: true })
                .eq('record_id', pw!.id).eq('user_id', payroll.id).eq('new_values->>event', 'pay_week_closed')
            assertEquals(count, 1)

            const again = await call('close-pay-week', { token: payroll.token, body: body('close') })
            assertEquals(again.json.already_closed, true)
        })

        await t.step('closed week is frozen: payroll returns the snapshot, edits are refused', async () => {
            // Cambia la tarifa: la nómina de la semana cerrada NO cambia
            must(await service.from('harvest_settings').update({ piece_rate: 10 }).eq('orchard_id', orchard), 'rate')
            const r = await payrollOf(payroll.token)
            assertEquals(r.status, 200, show(r))
            assert(r.json.closed, 'snapshot marked as closed')
            assertEquals(r.json.summary.total_earnings, closedTotal)

            // Corregir un fichaje de la semana cerrada → rechazado
            const fix = await call('manage-attendance', {
                token: leader.token,
                body: { action: 'correct', attendance_id: att!.id, check_out: nzTime(tue, '17:00'), reason: 'late finish', admin_id: leader.id },
            })
            // 409 con el código delante (lockedPeriodError de _shared/attendance-access.ts)
            assertEquals(fix.status, 409, show(fix))
            assertStringIncludes(fix.text, 'PAY_WEEK_CLOSED')
            const { data: still } = must(await service.from('daily_attendance').select('check_out').eq('id', att!.id).single(), 'att')
            assertEquals(new Date(still!.check_out).toISOString(), nzTime(tue, '16:30'))
        })

        await t.step('reopen: payroll/admin only, needs a reason, then live numbers again', async () => {
            const byManager = await call('close-pay-week', { token: manager.token, body: body('reopen', { reason: 'manager tries' }) })
            assertEquals(byManager.status, 403, show(byManager))
            const noReason = await call('close-pay-week', { token: payroll.token, body: body('reopen') })
            assertEquals(noReason.status, 400, show(noReason))
            assertStringIncludes(noReason.text, 'REASON_REQUIRED')

            const ok = await call('close-pay-week', { token: payroll.token, body: body('reopen', { reason: 'rate was wrong' }) })
            assertEquals(ok.status, 200, show(ok))
            const { data: pw } = must(await service.from('pay_weeks').select('status, reopened_by, reopen_reason').eq('week_start', monday).single(), 'pw')
            assertEquals(pw!.status, 'reopened')
            assertEquals(pw!.reopened_by, payroll.id)
            assertEquals(pw!.reopen_reason, 'rate was wrong')

            // Ya no es foto: 20 × 10 = 200 (> 191.60) + 35.93
            const live = await payrollOf(payroll.token)
            assertEquals(live.json.closed, undefined)
            assertEquals(live.json.summary.total_earnings, 235.93)
        })

        await t.step('admin can close again: a new snapshot', async () => {
            const r = await call('close-pay-week', { token: admin.token, body: body('close') })
            assertEquals(r.json.closed, true, show(r))
            assertEquals(r.json.total_earnings, 235.93)
            const { data: pw } = must(await service.from('pay_weeks').select('closed_by').eq('week_start', monday).single(), 'pw')
            assertEquals(pw!.closed_by, admin.id)
            // Reabrir para que la limpieza pueda borrar los datos de la semana
            await call('close-pay-week', { token: admin.token, body: body('reopen', { reason: 'test cleanup' }) })
        })
    } finally {
        await cleanupAll()
    }
} })
