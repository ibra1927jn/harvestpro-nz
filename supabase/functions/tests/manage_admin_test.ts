/**
 * manage-admin: solo admin cambia roles y da de baja / alta; el cambio se
 * aplica de verdad (y si no hay nadie a quien aplicarlo, no se responde
 * "success"); una cuenta dada de baja deja de pasar requireRole.
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { call, cleanupAll, makeOrchard, makeUser, must, service, show, testOpts } from './_helpers.ts'

Deno.test({ name: 'manage-admin', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard()
        const admin = await makeUser('admin', { orchardId: orchard })
        const manager = await makeUser('manager', { orchardId: orchard })
        const target = await makeUser('runner', { orchardId: orchard })
        const roleOf = async (id: string) =>
            must(await service.from('users').select('role, is_active').eq('id', id).single(), 'role').data!

        await t.step('admin changes a role; audited with the admin as author', async () => {
            const r = await call('manage-admin', { token: admin.token, body: { action: 'update_role', user_id: target.id, new_role: 'team_leader' } })
            assertEquals(r.status, 200, show(r))
            assertEquals((await roleOf(target.id)).role, 'team_leader')
            const { data } = must(await service.from('audit_logs').select('user_id, new_values')
                .eq('record_id', target.id).eq('new_values->>event', 'user_role_changed'), 'audit')
            assertEquals(data!.map(a => [a.user_id, a.new_values.role]), [[admin.id, 'team_leader']])
        })

        await t.step('a manager cannot change roles (and nothing changes)', async () => {
            const r = await call('manage-admin', { token: manager.token, body: { action: 'update_role', user_id: target.id, new_role: 'admin' } })
            assertEquals(r.status, 403, show(r))
            assertEquals((await roleOf(target.id)).role, 'team_leader')
        })

        await t.step('an admin cannot modify their own account here', async () => {
            const r = await call('manage-admin', { token: admin.token, body: { action: 'update_role', user_id: admin.id, new_role: 'runner' } })
            assertEquals(r.status, 400, show(r))
            assertEquals((await roleOf(admin.id)).role, 'admin')
        })

        await t.step('unknown user → 404, not success', async () => {
            for (const action of ['update_role', 'deactivate', 'reactivate']) {
                const r = await call('manage-admin', {
                    token: admin.token, body: { action, user_id: crypto.randomUUID(), new_role: 'runner' },
                })
                assertEquals(r.status, 404, `${action}: ${show(r)}`)
            }
        })

        await t.step('deactivate → the account is locked out of functions; reactivate → back in', async () => {
            const before = await call('submit-audit-log', {
                token: target.token, body: { entries: [{ event_type: 'eft', severity: 'info', action: 'ping' }] },
            })
            assertEquals(before.status, 200, show(before))

            const off = await call('manage-admin', { token: admin.token, body: { action: 'deactivate', user_id: target.id } })
            assertEquals(off.status, 200, show(off))
            assertEquals((await roleOf(target.id)).is_active, false)
            const locked = await call('record-bucket', { token: target.token, body: { _warmup: true } })
            assertEquals(locked.status, 403, show(locked))

            const on = await call('manage-admin', { token: admin.token, body: { action: 'reactivate', user_id: target.id } })
            assertEquals(on.status, 200, show(on))
            assertEquals((await roleOf(target.id)).is_active, true)
            const back = await call('record-bucket', { token: target.token, body: { _warmup: true } })
            assertEquals(back.status, 200, show(back))
        })
    } finally {
        await cleanupAll()
    }
} })
