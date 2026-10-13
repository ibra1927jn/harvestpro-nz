/**
 * 2FA real para los tests de las Edge Functions: da de alta un factor TOTP con
 * secreto conocido y verifica un código para obtener una sesión aal2, igual
 * que la app tras la pantalla de código (ver e2e/mobile/support/totp.ts).
 *
 * BORRA los factores 2FA que la cuenta ya tuviera: solo contra un Supabase
 * local (127.0.0.1 / localhost); con cualquier otro host se niega.
 */

/** Roles que necesitan 2FA (mismo criterio que public.mfa_satisfied()) */
export const MFA_ROLES: ReadonlySet<string> = new Set(['admin', 'manager', 'payroll_admin', 'hr_admin'])

export function assertLocalSupabase(url: string): void {
    const host = new URL(url).hostname
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
        throw new Error(`Refusing to reset 2FA factors on a non-local Supabase (${host})`)
    }
}

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = ''
    for (const ch of input.replace(/=+$/, '').toUpperCase()) {
        const v = alphabet.indexOf(ch)
        if (v < 0) throw new Error(`Invalid base32 char ${ch}`)
        bits += v.toString(2).padStart(5, '0')
    }
    const out = new Uint8Array(new ArrayBuffer(Math.floor(bits.length / 8)))
    for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
    return out
}

/** Código TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s) del paso `step` */
export async function totpAt(secret: string, step: number): Promise<string> {
    const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
    const counter = new Uint8Array(8)
    new DataView(counter.buffer).setBigUint64(0, BigInt(step))
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter))
    const off = h[h.length - 1] & 0x0f
    const bin = (new DataView(h.buffer).getUint32(off) & 0x7fffffff) % 1_000_000
    return String(bin).padStart(6, '0')
}

interface AuthEnv {
    url: string
    anonKey: string
    serviceKey: string
}

async function authApi(env: AuthEnv, path: string, init: { method: string; token?: string; service?: boolean; body?: unknown }) {
    const key = init.service ? env.serviceKey : env.anonKey
    const res = await fetch(`${env.url}/auth/v1${path}`, {
        method: init.method,
        headers: { apikey: key, Authorization: `Bearer ${init.token ?? key}`, 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`auth ${path} → ${res.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
}

/**
 * Sube una sesión de solo contraseña (aal1) a aal2: borra los factores
 * anteriores, da de alta uno TOTP nuevo y verifica un código.
 * Devuelve el access_token aal2.
 */
export async function elevateToAal2(env: AuthEnv, userId: string, aal1Token: string): Promise<string> {
    assertLocalSupabase(env.url)
    const existing = (await authApi(env, `/admin/users/${userId}/factors`, { method: 'GET', service: true })) as { id: string }[] | null
    for (const f of existing ?? []) {
        await authApi(env, `/admin/users/${userId}/factors/${f.id}`, { method: 'DELETE', service: true })
    }
    const factor = await authApi(env, '/factors', {
        method: 'POST',
        token: aal1Token,
        body: { factor_type: 'totp', friendly_name: `edge-tests-${crypto.randomUUID().slice(0, 8)}` },
    })
    const challenge = await authApi(env, `/factors/${factor.id}/challenge`, { method: 'POST', token: aal1Token, body: {} })
    const code = await totpAt(factor.totp.secret as string, Math.floor(Date.now() / 30_000))
    const session = await authApi(env, `/factors/${factor.id}/verify`, {
        method: 'POST',
        token: aal1Token,
        body: { challenge_id: challenge.id, code },
    })
    if (!session?.access_token) throw new Error('2FA verify returned no session')
    return session.access_token as string
}

/** Nivel (aal) de un JWT, sin verificarlo (solo para asserts de los tests) */
export function aalOf(token: string): string | undefined {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
    return (JSON.parse(json) as { aal?: string }).aal
}
