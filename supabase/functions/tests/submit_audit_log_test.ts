/**
 * submit-audit-log: la entrada se guarda a nombre de quien llama (no del
 * user_id/user_email del cuerpo) y con la hora del servidor.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { RUN, call, cleanupAll, onCleanup, seededId, seededToken, service, show, testOpts } from './_helpers.ts'

Deno.test({ name: 'submit-audit-log records the caller, not the body', ...testOpts, fn: async () => {
    onCleanup(() => service.from('audit_logs').delete().eq('new_values->details->>run', RUN))
    try {
        const runnerId = await seededId('runner')
        const adminId = await seededId('admin')
        const r = await call('submit-audit-log', {
            token: await seededToken('runner'),
            headers: { 'X-Forwarded-For': '203.0.113.7' },
            body: {
                entries: [{
                    event_type: 'eft.test',
                    severity: 'info',
                    action: 'eft_forged',
                    user_id: adminId,                 // intenta firmar como admin
                    user_email: 'admin@harvestpro.nz',
                    created_at: '2000-01-01T00:00:00Z', // e inventar la hora
                    details: { run: RUN, nested: { ok: true } },
                }],
            },
        })
        assertEquals(r.status, 200, show(r))
        assertEquals(r.json.count, 1)

        const { data, error } = await service.from('audit_logs')
            .select('user_id, user_email, created_at, action, new_values')
            .eq('new_values->details->>run', RUN)
        assertEquals(error, null)
        assertEquals(data?.length, 1)
        const row = data![0]
        assertEquals(row.user_id, runnerId)
        assertEquals(row.user_email, 'runner@harvestpro.nz')
        assertEquals(row.action, 'CUSTOM')
        assertEquals(row.new_values.event, 'eft_forged')
        assertEquals(row.new_values.details.nested, { ok: true })
        assert(Date.now() - new Date(row.created_at).getTime() < 10 * 60_000, `created_at was not server time: ${row.created_at}`)
    } finally {
        await cleanupAll()
    }
} })
