/**
 * provision-orchard (alta pública, sin JWT): una instalación por empresa.
 * Con un huerto ya creado responde 403 y no crea NADA (ni la cuenta).
 * La creación de la primera empresa no se prueba aquí: exigiría vaciar los
 * huertos de la base compartida.
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { RUN, call, cleanupAll, service, show, testOpts } from './_helpers.ts'

function body(email: string, extra: Record<string, unknown> = {}) {
    return {
        orchard_name: `EFT ${RUN} hijack`, admin_email: email, admin_password: 'Sup3r-secret-pass',
        admin_name: 'Mallory', accepted_terms: true, accepted_privacy: true, terms_version: '1', privacy_version: '1',
        ...extra,
    }
}

/** IP inventada por petición: el límite (5/h) es por X-Forwarded-For */
const ip = () => ({ 'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 250) + 1}, 10.${RUN.length}.0.1` })

Deno.test({ name: 'provision-orchard', ...testOpts, fn: async t => {
    try {
        await t.step('an installation that already has an orchard refuses a second sign-up, creating nothing', async () => {
            const email = `eft-${RUN}-hijack@example.test`
            const r = await call('provision-orchard', { origin: null, body: body(email), headers: ip() })
            assertEquals(r.status, 403, show(r))
            const { count } = await service.from('orchards').select('id', { count: 'exact', head: true }).like('name', `EFT ${RUN} hijack%`)
            assertEquals(count, 0)
            // La cuenta tampoco existe: se puede crear ahora con ese email
            const { data, error } = await service.auth.admin.createUser({ email, password: 'x-' + crypto.randomUUID(), email_confirm: true })
            assertEquals(error, null, 'the refused sign-up must not have left an auth user behind')
            if (data.user) await service.auth.admin.deleteUser(data.user.id)
        })

        await t.step('validation: terms not accepted, short password, bad email → 400', async () => {
            const email = `eft-${RUN}-v@example.test`
            for (const extra of [{ accepted_terms: false }, { admin_password: 'short' }, { admin_email: 'not-an-email' }, { orchard_name: '' }]) {
                const r = await call('provision-orchard', { body: body(email, extra), headers: ip() })
                assertEquals(r.status, 400, `${JSON.stringify(extra)} → ${show(r)}`)
            }
        })

        await t.step('rate limit: 5 attempts per client per hour', async () => {
            const headers = { 'X-Forwarded-For': `192.0.2.${Math.floor(Math.random() * 250) + 1}-${RUN}` }
            const statuses: number[] = []
            for (let i = 0; i < 6; i++) {
                statuses.push((await call('provision-orchard', { body: { orchard_name: '' }, headers })).status)
            }
            assertEquals(statuses, [400, 400, 400, 400, 400, 429])
        })
    } finally {
        await cleanupAll()
    }
} })
