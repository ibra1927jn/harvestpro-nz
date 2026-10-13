/**
 * requireRole() contra el Supabase local (prueba de integración, Deno).
 *
 *   set -a; . /home/claude/.hp-local-env; set +a
 *   SUPABASE_URL=$VITE_SUPABASE_URL SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
 *     deno test --allow-net --allow-env supabase/functions/_shared/security_test.ts
 *
 * El rol tiene que salir de public.users (lo decide la empresa), no de
 * user_metadata: cualquier usuario puede cambiar su propio user_metadata con
 * supabase.auth.updateUser({ data: { role: 'admin' } }).
 */
import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AuthError, requireRole } from './security.ts'

const URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PASSWORD = 'Sectest-' + crypto.randomUUID()

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

/** Cuenta de prueba con rol `role` en public.users; devuelve su id */
async function makeUser(role: string, isActive = true): Promise<{ id: string; email: string }> {
    const email = `sectest-edge-${crypto.randomUUID()}@example.test`
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    const { error: profileErr } = await admin.from('users')
        .insert({ id: data.user.id, email, full_name: 'SecTest edge', role, is_active: isActive })
    if (profileErr) throw new Error(`users.insert: ${profileErr.message}`)
    return { id: data.user.id, email }
}

async function signIn(email: string): Promise<string> {
    const client = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (error || !data.session) throw new Error(`signIn: ${error?.message}`)
    return data.session.access_token
}

function requestWith(token: string): Request {
    return new Request('http://localhost/fn', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
}

Deno.test('requireRole ignores a role the user wrote into their own user_metadata', async () => {
    const user = await makeUser('runner')
    try {
        // El propio usuario se pone rol payroll_admin en sus metadatos
        const token = await signIn(user.email)
        // (lo mismo que supabase.auth.updateUser({ data: { role } }) en el navegador)
        const res = await fetch(`${URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { role: 'payroll_admin' } }),
        })
        assertEquals(res.status, 200)
        await res.body?.cancel()
        const spoofed = await signIn(user.email)

        // close-pay-week pide admin | payroll_admin
        const err = await assertRejects(() => requireRole(requestWith(spoofed), ['admin', 'payroll_admin']), AuthError)
        assertEquals((err as AuthError).status, 403)

        // Su rol de verdad sigue funcionando
        const ok = await requireRole(requestWith(spoofed), ['runner'])
        assertEquals(ok.user.id, user.id)
    } finally {
        await admin.auth.admin.deleteUser(user.id)
    }
})

Deno.test('requireRole rejects a deactivated account', async () => {
    const user = await makeUser('manager', false)
    try {
        const token = await signIn(user.email)
        const err = await assertRejects(() => requireRole(requestWith(token), ['admin', 'manager']), AuthError)
        assertEquals((err as AuthError).status, 403)
    } finally {
        await admin.auth.admin.deleteUser(user.id)
    }
})

Deno.test('requireRole accepts the role stored in public.users', async () => {
    const user = await makeUser('payroll_admin')
    try {
        const token = await signIn(user.email)
        const ok = await requireRole(requestWith(token), ['admin', 'payroll_admin'])
        assertEquals(ok.user.id, user.id)
    } finally {
        await admin.auth.admin.deleteUser(user.id)
    }
})
