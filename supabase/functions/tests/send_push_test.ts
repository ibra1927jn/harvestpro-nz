/**
 * send-push: entrega real a un "servicio push" falso que levanta el test.
 *
 * - send_to_user llega al destinatario (antes leía sus suscripciones con el
 *   cliente de quien envía y RLS las ocultaba: nunca se enviaba nada).
 * - Solo a gente del huerto de quien envía (igual que broadcast).
 * - Una suscripción caducada (410) se borra.
 *
 * Necesita que el runtime tenga VAPID_* (el runtime privado de
 * scripts/dev-edge-runtime.sh las pone) y que el contenedor llegue al host:
 * PUSH_SINK_HOST (por defecto host.docker.internal).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { call, cleanupAll, makeOrchard, makeUser, must, service, show, testOpts, type TempUser } from './_helpers.ts'

const SINK_HOST = Deno.env.get('PUSH_SINK_HOST') ?? 'host.docker.internal'

function b64url(bytes: ArrayBuffer | Uint8Array): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    return btoa(String.fromCharCode(...arr)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Claves de suscripción válidas (P-256 + secreto de 16 bytes) */
async function subscriptionKeys(): Promise<{ keys_p256dh: string; keys_auth: string }> {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    return {
        keys_p256dh: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)),
        keys_auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
    }
}

Deno.test({ name: 'send-push', ...testOpts, fn: async t => {
    // Servicio push falso: cuenta las entregas por ruta; /gone/* responde 410
    const hits = new Map<string, { encoding: string | null; auth: string | null; bytes: number }[]>()
    const sink = Deno.serve({ port: 0, hostname: '0.0.0.0', onListen: () => {} }, async req => {
        const path = new URL(req.url).pathname
        const body = new Uint8Array(await req.arrayBuffer())
        const list = hits.get(path) ?? []
        list.push({ encoding: req.headers.get('content-encoding'), auth: req.headers.get('authorization'), bytes: body.length })
        hits.set(path, list)
        return new Response(null, { status: path.startsWith('/gone/') ? 410 : 201 })
    })
    const port = sink.addr.port
    const subscribe = async (user: TempUser, kind = 'ok'): Promise<string> => {
        const path = `/${kind}/${user.id}`
        must(await service.from('push_subscriptions').insert({
            user_id: user.id, endpoint: `http://${SINK_HOST}:${port}${path}`, ...(await subscriptionKeys()),
        }), 'push_subscriptions.insert')
        return path
    }

    try {
        const orchardT = await makeOrchard()
        const orchardU = await makeOrchard()
        const manager = await makeUser('manager', { orchardId: orchardT })
        const runner = await makeUser('runner', { orchardId: orchardT })
        const outsider = await makeUser('runner', { orchardId: orchardU })
        const former = await makeUser('runner', { orchardId: orchardT })
        const runnerPath = await subscribe(runner)
        const outsiderPath = await subscribe(outsider)
        const formerPath = await subscribe(former)
        must(await service.from('users').update({ is_active: false }).eq('id', former.id), 'deactivate former')

        // ¿El runtime tiene claves VAPID? Sin ellas no hay entrega que comprobar
        const probe = await call('send-push', { token: runner.token, body: { action: 'test' } })
        if (probe.status === 400 && probe.text.includes('VAPID')) {
            console.warn('[send-push] runtime has no VAPID keys: delivery steps skipped (use scripts/dev-edge-runtime.sh start)')
            return
        }

        await t.step('test push reaches the caller\'s own device', () => {
            assertEquals(probe.status, 200, show(probe))
            assertEquals(probe.json.sent, 1)
            const got = hits.get(runnerPath) ?? []
            assertEquals(got.length, 1)
            assertEquals(got[0].encoding, 'aes128gcm')
            assert(got[0].auth?.startsWith('vapid t='), 'VAPID authorization header')
            assert(got[0].bytes > 86, 'encrypted payload present')
        })

        await t.step('send_to_user delivers to the recipient\'s devices', async () => {
            hits.clear()
            const r = await call('send-push', {
                token: manager.token, body: { action: 'send_to_user', user_id: runner.id, title: 'Row 4', body: 'Bin full' },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.sent, 1, show(r))
            assertEquals((hits.get(runnerPath) ?? []).length, 1)
        })

        await t.step('send_to_user outside the sender\'s orchard → 403, nothing sent', async () => {
            hits.clear()
            const r = await call('send-push', {
                token: manager.token, body: { action: 'send_to_user', user_id: outsider.id, title: 'x', body: 'y' },
            })
            assertEquals(r.status, 403, show(r))
            assertEquals(hits.size, 0)
        })

        await t.step('broadcast only reaches active people in the sender\'s orchard', async () => {
            hits.clear()
            const r = await call('send-push', {
                token: manager.token, body: { action: 'broadcast', role: 'runner', title: 'Rain', body: 'Stop picking' },
            })
            assertEquals(r.status, 200, show(r))
            assertEquals(r.json.sent, 1, show(r))
            assertEquals((hits.get(runnerPath) ?? []).length, 1)
            assertEquals(hits.get(outsiderPath), undefined)
            assertEquals(hits.get(formerPath), undefined, 'deactivated account got a broadcast')
        })

        await t.step('an expired subscription (410) is removed', async () => {
            const gonePath = await subscribe(runner, 'gone')
            const r = await call('send-push', {
                token: manager.token, body: { action: 'send_to_user', user_id: runner.id, title: 'x', body: 'y' },
            })
            assertEquals(r.status, 200, show(r))
            const { data } = must(await service.from('push_subscriptions').select('endpoint').eq('user_id', runner.id), 'subs')
            assertEquals(data!.map(s => new URL(s.endpoint).pathname), [runnerPath])
            assertEquals((hits.get(gonePath) ?? []).length, 1)
        })
    } finally {
        await cleanupAll()
        await sink.shutdown()
    }
} })
