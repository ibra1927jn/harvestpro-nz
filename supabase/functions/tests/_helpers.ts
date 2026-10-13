/**
 * Utilidades de los tests de integración de las Edge Functions.
 *
 * Los tests llaman a las funciones REALES por HTTP (edge runtime local) con
 * JWT reales de usuarios del seed (contraseña 111111) o de usuarios de prueba
 * creados en cada ejecución, y comprueban el resultado en la base de datos.
 * Todo lo que crean lleva el id de ejecución y se borra al final.
 *
 * Variables: SUPABASE_URL | VITE_SUPABASE_URL, SUPABASE_ANON_KEY |
 * VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y, opcional,
 * FUNCTIONS_URL (por defecto <SUPABASE_URL>/functions/v1).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function env(...names: string[]): string {
    for (const n of names) {
        const v = Deno.env.get(n)
        if (v) return v
    }
    throw new Error(`Missing env ${names.join(' | ')} (see supabase/functions/tests/README in the report)`)
}

export const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
export const ANON_KEY = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
export const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
export const FUNCTIONS_URL = (Deno.env.get('FUNCTIONS_URL') ?? `${SUPABASE_URL}/functions/v1`).replace(/\/$/, '')

/** Origen permitido por la lista CORS de _shared/security.ts */
export const ORIGIN = 'http://localhost:5173'
export const EVIL_ORIGIN = 'https://evil.example.com'

/** Id corto de esta ejecución: marca todos los datos que crean los tests */
export const RUN = crypto.randomUUID().slice(0, 8)

export const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
})

/** Opciones para Deno.test: supabase-js deja timers/conexiones abiertas */
export const testOpts = { sanitizeOps: false, sanitizeResources: false } as const

// ── Usuarios ────────────────────────────────────────────────

export const SEEDED = {
    admin: 'admin@harvestpro.nz',
    manager: 'manager@harvestpro.nz',
    team_leader: 'lead@harvestpro.nz',
    runner: 'runner@harvestpro.nz',
    qc_inspector: 'qc@harvestpro.nz',
    logistics: 'logistics@harvestpro.nz',
    hr_admin: 'hr@harvestpro.nz',
    payroll_admin: 'payroll@harvestpro.nz',
} as const
export type Role = keyof typeof SEEDED
export const ALL_ROLES = Object.keys(SEEDED) as Role[]
const SEED_PASSWORD = '111111'

const tokenCache = new Map<string, string>()

/** JWT de un usuario (una sola vez por ejecución: GoTrue limita los logins) */
export async function login(email: string, password = SEED_PASSWORD): Promise<string> {
    const cached = tokenCache.get(email)
    if (cached) return cached
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })
    const body = await res.json()
    if (!res.ok || !body.access_token) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`)
    tokenCache.set(email, body.access_token)
    return body.access_token
}

export function seededToken(role: Role): Promise<string> {
    return login(SEEDED[role])
}

/** id de un usuario del seed */
export async function seededId(role: Role): Promise<string> {
    const { data, error } = await service.from('users').select('id').eq('email', SEEDED[role]).single()
    if (error) throw new Error(`seededId ${role}: ${error.message}`)
    return data.id as string
}

export interface TempUser {
    id: string
    email: string
    password: string
    token: string
}

// ── Limpieza ────────────────────────────────────────────────

type Cleanup = () => PromiseLike<unknown>
const cleanups: Cleanup[] = []
/** Ids creados (usuarios, huertos, personas): sus filas de auditoría se borran al final */
const createdIds = new Set<string>()
const createdOrchards = new Set<string>()

/** Registra una limpieza; se ejecutan en orden inverso en cleanupAll() */
export function onCleanup(fn: Cleanup): void {
    cleanups.push(fn)
}

export async function cleanupAll(): Promise<void> {
    const errors: string[] = []
    while (cleanups.length) {
        const fn = cleanups.pop()!
        try {
            await fn()
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e))
        }
    }
    // Filas que los triggers de auditoría escribieron sobre los datos de prueba
    const ids = [...createdIds]
    const orchards = [...createdOrchards]
    for (let i = 0; i < Math.max(ids.length, orchards.length); i += 50) {
        const idList = ids.slice(i, i + 50).join(',')
        const orList = orchards.slice(i, i + 50).join(',')
        const filters = [
            idList && `record_id.in.(${idList})`,
            idList && `user_id.in.(${idList})`,
            orList && `new_values->>orchard_id.in.(${orList})`,
            orList && `old_values->>orchard_id.in.(${orList})`,
        ].filter(Boolean).join(',')
        const { error } = await service.from('audit_logs').delete().or(filters)
        if (error) errors.push(`audit_logs cleanup: ${error.message}`)
    }
    createdIds.clear()
    createdOrchards.clear()
    if (errors.length) console.warn(`[tests] cleanup warnings:\n  ${errors.join('\n  ')}`)
}

/** Lanza si una operación de limpieza / preparación con service role falla */
export function must<T extends { error: { message: string } | null }>(r: T, what: string): T {
    if (r.error) throw new Error(`${what}: ${r.error.message}`)
    return r
}

/**
 * Usuario de prueba con su rol en public.users. Se borra al final (y con él,
 * su ficha de persona, fichajes y cubetas que lo referencian).
 */
export async function makeUser(
    role: Role,
    opts: { orchardId?: string | null; active?: boolean; login?: boolean } = {},
): Promise<TempUser> {
    const email = `eft-${RUN}-${role}-${crypto.randomUUID().slice(0, 6)}@example.test`
    const password = `Eft-${crypto.randomUUID()}`
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    const id = data.user.id
    createdIds.add(id)
    onCleanup(() => deleteUserCascade(id))
    must(await service.from('users').insert({
        id, email, full_name: `EFT ${RUN} ${role}`, role,
        orchard_id: opts.orchardId ?? null, is_active: true,
    }), 'users.insert')
    // Token antes de desactivar (un desactivado sigue pudiendo iniciar sesión en GoTrue)
    const token = opts.login === false ? '' : await login(email, password)
    if (opts.active === false) {
        must(await service.from('users').update({ is_active: false }).eq('id', id), 'users.deactivate')
    }
    return { id, email, password, token }
}

async function deleteUserCascade(id: string): Promise<void> {
    // Lo que referencia al usuario sin ON DELETE CASCADE
    await service.from('bucket_records').delete().eq('scanned_by', id)
    await service.from('bucket_records').delete().eq('picker_id', id)
    await service.from('daily_attendance').delete().eq('picker_id', id)
    await service.from('daily_attendance').delete().or(`verified_by.eq.${id},corrected_by.eq.${id},recorded_by.eq.${id}`)
    await service.from('pay_weeks').delete().or(`closed_by.eq.${id},reopened_by.eq.${id}`)
    await service.from('day_closures').delete().eq('closed_by', id)
    await service.from('pickers').delete().eq('id', id)
    await service.from('push_subscriptions').delete().eq('user_id', id)
    await service.from('audit_logs').delete().eq('user_id', id)
    must(await service.from('users').delete().eq('id', id), `users.delete ${id}`)
    const { error } = await service.auth.admin.deleteUser(id)
    if (error) throw new Error(`auth.deleteUser ${id}: ${error.message}`)
}

// ── Huertos y personas ──────────────────────────────────────

/** Huerto de prueba con su harvest_settings; se borra al final */
export async function makeOrchard(
    settings: { piece_rate?: number; min_wage_rate?: number } = {},
): Promise<string> {
    const { data } = must(
        await service.from('orchards').insert({ name: `EFT ${RUN} ${crypto.randomUUID().slice(0, 4)}`, total_rows: 10 }).select('id').single(),
        'orchards.insert',
    )
    const id = data!.id as string
    createdIds.add(id)
    createdOrchards.add(id)
    onCleanup(async () => {
        await service.from('bucket_records').delete().eq('orchard_id', id)
        await service.from('daily_attendance').delete().eq('orchard_id', id)
        await service.from('day_closures').delete().eq('orchard_id', id)
        await service.from('pickers').delete().eq('orchard_id', id)
        await service.from('harvest_settings').delete().eq('orchard_id', id)
        await service.from('users').update({ orchard_id: null }).eq('orchard_id', id)
        must(await service.from('orchards').delete().eq('id', id), `orchards.delete ${id}`)
    })
    must(await service.from('harvest_settings').insert({
        orchard_id: id,
        piece_rate: settings.piece_rate ?? 6.5,
        min_wage_rate: settings.min_wage_rate ?? 23.95,
    }), 'harvest_settings.insert')
    return id
}

/** Picker (persona de campo) con tarjeta única */
export async function makePicker(orchardId: string, opts: { status?: string } = {}): Promise<{ id: string; badge: string }> {
    const badge = `EFT-${RUN}-${crypto.randomUUID().slice(0, 6)}`.toUpperCase()
    const { data } = must(
        await service.from('pickers').insert({
            picker_id: badge, name: `EFT picker ${badge}`, orchard_id: orchardId,
            status: opts.status ?? 'active', role: 'picker',
        }).select('id').single(),
        'pickers.insert',
    )
    const id = data!.id as string
    createdIds.add(id)
    onCleanup(async () => {
        await service.from('bucket_records').delete().eq('picker_id', id)
        await service.from('daily_attendance').delete().eq('picker_id', id)
        await service.from('pickers').delete().eq('id', id)
    })
    return { id, badge }
}

// ── Fechas NZ ───────────────────────────────────────────────

/** Desfase horario de NZ (+12:00 / +13:00) en una fecha */
export function nzOffset(dateYMD: string): string {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
        .formatToParts(new Date(`${dateYMD}T12:00:00Z`))
        .find(p => p.type === 'timeZoneName')
    return part?.value.replace('GMT', '') || '+13:00'
}

/** Timestamp ISO de una hora NZ: nzTime('2021-03-02', '08:00') */
export function nzTime(dateYMD: string, hhmm: string): string {
    return new Date(`${dateYMD}T${hhmm}:00${nzOffset(dateYMD)}`).toISOString()
}

export function nzToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())
}

export function addDays(dateYMD: string, n: number): string {
    const d = new Date(`${dateYMD}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}

/**
 * Un lunes pasado al azar dentro de un año dado, para que cada fichero (y cada
 * ejecución) use su propia semana de pago y no choque con otros datos.
 */
export function randomMonday(year: number): string {
    const jan1 = new Date(Date.UTC(year, 0, 1))
    const firstMonday = (8 - jan1.getUTCDay()) % 7
    const week = Math.floor(Math.random() * 50)
    return addDays(jan1.toISOString().slice(0, 10), firstMonday + week * 7)
}

// ── Llamadas HTTP ───────────────────────────────────────────

/** Respuesta de una función; `json` es el cuerpo ya parseado ({} si no era JSON) */
export interface FnResponse<T = Record<string, unknown>> {
    status: number
    text: string
    json: T
    headers: Headers
}

export async function call<T = Record<string, unknown>>(
    fn: string,
    opts: {
        token?: string | null
        body?: unknown
        rawBody?: string
        origin?: string | null
        method?: string
        path?: string
        headers?: Record<string, string>
    } = {},
): Promise<FnResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
    const method = opts.method ?? 'POST'
    const res = await fetch(`${FUNCTIONS_URL}/${fn}${opts.path ?? ''}`, {
        method,
        headers,
        body: method === 'GET' || method === 'OPTIONS'
            ? undefined
            : opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    })
    const text = await res.text()
    let json: unknown = {}
    try {
        json = text ? JSON.parse(text) : {}
    } catch {
        json = {}
    }
    return { status: res.status, text, json: json as T, headers: res.headers }
}

/** Mensaje de error legible para asserts */
export function show<T>(r: FnResponse<T>): string {
    return `HTTP ${r.status}: ${r.text.slice(0, 400)}`
}

export function assertStatus<T>(r: FnResponse<T>, expected: number | number[]): void {
    const list = Array.isArray(expected) ? expected : [expected]
    assert(list.includes(r.status), `expected ${list.join('|')}, got ${show(r)}`)
}

/**
 * La respuesta no filtra nada interno: ni trazas de pila, ni rutas de
 * ficheros, ni claves/JWT, ni cadenas de conexión.
 */
export function assertNoLeak<T>(r: FnResponse<T>): void {
    const t = r.text
    const leaks: [RegExp, string][] = [
        [/\n\s+at\s/, 'stack trace'],
        [/file:\/\/|\/home\/|\/root\/|\.ts:\d+/, 'source path'],
        [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
        [/postgres(ql)?:\/\//, 'connection string'],
        [/SERVICE_ROLE|service_role_key|super-secret-jwt/i, 'secret name'],
    ]
    for (const [re, what] of leaks) assert(!re.test(t), `response leaks ${what}: ${t.slice(0, 300)}`)
    assert(!t.includes(SERVICE_KEY), 'response leaks the service role key')
}

/** 4xx con cuerpo JSON y sin filtraciones (entrada inválida) */
export function assertCleanRejection<T>(r: FnResponse<T>, status: number | number[] = 400): void {
    assertStatus(r, status)
    assertNoLeak(r)
}

// ── Comprobaciones comunes ──────────────────────────────────

/** Cuerpos inválidos típicos: JSON roto, tipos equivocados, payload enorme */
export async function checkInputValidation(
    fn: string,
    token: string,
    wrongTypes: unknown[],
): Promise<void> {
    const broken = await call(fn, { token, rawBody: '{"not json' })
    assertCleanRejection(broken)

    for (const body of wrongTypes) {
        const r = await call(fn, { token, body })
        assertCleanRejection(r)
    }

    // 2 MB de texto en un campo: se rechaza sin caerse (400/413), nunca 5xx
    const huge = await call(fn, { token, body: { action: 'x'.repeat(2_000_000), orchard_id: 'x'.repeat(2_000_000) } })
    assertCleanRejection(huge, [400, 413])
}

/**
 * Matriz de roles con los usuarios del seed. Se manda un cuerpo inválido:
 * un rol permitido pasa la autorización y llega a la validación (400); uno no
 * permitido se para antes (403). Así no se toca ningún dato.
 */
export async function checkRoleMatrix(fn: string, allowed: Role[], invalidBody: unknown = { _invalid: true }): Promise<void> {
    for (const role of ALL_ROLES) {
        const r = await call(fn, { token: await seededToken(role), body: invalidBody })
        if (allowed.includes(role)) {
            assertEquals(r.status, 400, `${fn}: role ${role} should pass auth and fail validation, got ${show(r)}`)
        } else {
            assertEquals(r.status, 403, `${fn}: role ${role} should be forbidden, got ${show(r)}`)
        }
        assertNoLeak(r)
    }
}

/** CORS: el origen permitido se refleja; uno ajeno no recibe Allow-Origin */
export async function checkCors(fn: string): Promise<void> {
    const ok = await call(fn, { method: 'OPTIONS', origin: ORIGIN })
    assertEquals(ok.status, 200, show(ok))
    assertEquals(ok.headers.get('access-control-allow-origin'), ORIGIN)

    const evil = await call(fn, { method: 'OPTIONS', origin: EVIL_ORIGIN })
    assertEquals(evil.headers.get('access-control-allow-origin'), null, `${fn}: disallowed origin got ACAO`)
    assert(evil.headers.get('access-control-allow-origin') !== '*')

    // También en las respuestas normales (no solo el preflight)
    const post = await call(fn, { origin: EVIL_ORIGIN, body: {} })
    assert(post.headers.get('access-control-allow-origin') !== EVIL_ORIGIN, `${fn}: POST reflected a disallowed origin`)
    assert(post.headers.get('access-control-allow-origin') !== '*', `${fn}: POST answered with ACAO *`)
}

/**
 * El propio usuario se escribe un rol en user_metadata (lo que permite
 * supabase.auth.updateUser en el navegador) y devuelve un token nuevo.
 */
export async function spoofMetadataRole(user: TempUser, role: Role): Promise<string> {
    const upd = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { role } }),
    })
    assertEquals(upd.status, 200, 'updateUser(user_metadata.role) is allowed for the user')
    await upd.body?.cancel()
    tokenCache.delete(user.email)
    return login(user.email, user.password)
}
