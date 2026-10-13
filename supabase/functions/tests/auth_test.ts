/**
 * Autenticación, roles, validación de entrada y CORS de TODAS las Edge
 * Functions, contra el runtime real (ver _helpers.ts).
 *
 * - Matriz de roles con los usuarios del seed: permitido → pasa a validación
 *   (400), no permitido → 403. Sin tocar datos.
 * - Rol privilegiado con sesión sin 2FA (aal1) → 403 (2FA en el servidor).
 * - Sin token / token anon / basura → 401; usuario desactivado → 403; rol
 *   escrito por el usuario en su user_metadata → no cuenta (403).
 * - JSON roto, tipos equivocados, payload enorme → 400/413 sin filtrar trazas
 *   ni secretos.
 * - CORS: origen permitido reflejado, origen ajeno sin Allow-Origin.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    ANON_KEY, type Role, SEEDED, call, checkCors, checkInputValidation, checkRoleMatrix, cleanupAll,
    loginAal1, makeUser, seededToken, withMfaEnforced, show, spoofMetadataRole, testOpts, assertNoLeak, assertCleanRejection,
} from './_helpers.ts'
import { MFA_ROLES, aalOf } from './_totp.ts'

const UUID = '00000000-0000-4000-8000-000000000000'

/** Funciones con JWT de usuario y los roles que admiten */
const ROLE_FUNCTIONS: { fn: string; allowed: Role[]; wrongTypes: unknown[] }[] = [
    {
        fn: 'record-bucket',
        allowed: ['admin', 'manager', 'team_leader', 'runner'],
        wrongTypes: [{ picker_id: 123, orchard_id: true }, { picker_id: 'X', orchard_id: UUID, row_number: 'three' }, []],
    },
    {
        fn: 'approve-timesheet',
        allowed: ['admin', 'manager', 'payroll_admin'],
        wrongTypes: [{ attendance_id: 42 }, { attendance_id: 'not-a-uuid' }, ['x'], { attendance_id: '00000000-0000-4000-8000-000000000000', decision: 'delete' }],
    },
    {
        fn: 'calculate-payroll',
        allowed: ['admin', 'manager', 'payroll_admin', 'hr_admin'],
        wrongTypes: [{ start_date: 20210101, end_date: '2021-01-07' }, { orchard_id: 'x', start_date: '2021-01-01', end_date: '2021-01-07' }, 'str'],
    },
    {
        fn: 'close-pay-week',
        allowed: ['admin', 'payroll_admin'],
        wrongTypes: [{ action: 'delete', week_start: '2021-01-04' }, { action: 'status', week_start: 5 }, { action: 'close' }],
    },
    {
        fn: 'manage-attendance',
        allowed: ['admin', 'manager', 'team_leader'],
        wrongTypes: [{ action: 'check_in', picker_id: 1 }, { action: 'teleport' }, { action: 'correct', attendance_id: UUID, reason: 'x' }],
    },
    {
        fn: 'manage-admin',
        allowed: ['admin'],
        wrongTypes: [{ action: 'update_role', user_id: UUID, new_role: 'god' }, { action: 'deactivate', user_id: 7 }, null],
    },
    {
        fn: 'check-compliance',
        allowed: ['admin', 'manager', 'team_leader'],
        wrongTypes: [{ orchard_id: UUID, picker_ids: [] }, { orchard_id: UUID, picker_ids: 'all' }, { orchard_id: UUID, picker_ids: Array(101).fill(UUID) }],
    },
    {
        fn: 'detect-anomalies',
        allowed: ['admin', 'manager', 'team_leader'],
        wrongTypes: [{ orchard_id: 99 }, { orchard_id: 'nope' }, {}],
    },
    {
        fn: 'send-push',
        allowed: ['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'logistics', 'hr_admin', 'payroll_admin'],
        wrongTypes: [{ action: 'send_to_user', user_id: 'x', title: 't', body: 'b' }, { action: 'broadcast', title: '', body: 'b' }, { action: 'nuke' }],
    },
    {
        fn: 'submit-audit-log',
        allowed: ['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'logistics', 'hr_admin', 'payroll_admin'],
        wrongTypes: [{ entries: [] }, { entries: [{ event_type: 'x', severity: 'apocalyptic', action: 'a' }] }, { entries: Array(101).fill({ event_type: 'x', severity: 'info', action: 'a' }) }],
    },
]

Deno.test({ name: 'edge functions: auth, roles, validation and CORS', ...testOpts, fn: async t => {
    try {
        // Usuarios de prueba compartidos por todas las funciones
        const inactiveAdmin = await makeUser('admin', { active: false })
        const runnerSpoofAdmin = await makeUser('runner')
        const runnerAsAdmin = await spoofMetadataRole(runnerSpoofAdmin, 'admin')
        const qcSpoofAdmin = await makeUser('qc_inspector')
        const qcAsAdmin = await spoofMetadataRole(qcSpoofAdmin, 'admin')

        for (const { fn, allowed, wrongTypes } of ROLE_FUNCTIONS) {
            await t.step(`${fn}: role matrix with seeded users`, () => checkRoleMatrix(fn, allowed))

            await t.step(`${fn}: no token / anon key / garbage token → 401`, async () => {
                for (const token of [null, ANON_KEY, 'not-a-jwt']) {
                    const r = await call(fn, { token, body: { _invalid: true } })
                    assertEquals(r.status, 401, `token=${token ? token.slice(0, 8) : 'none'} → ${show(r)}`)
                    assertNoLeak(r)
                }
            })

            await t.step(`${fn}: privileged role without 2FA (password-only session) → 403`, () => withMfaEnforced(async () => {
                for (const role of allowed.filter(r => MFA_ROLES.has(r))) {
                    const aal1 = await loginAal1(SEEDED[role])
                    assertEquals(aalOf(aal1), 'aal1')
                    const r = await call(fn, { token: aal1, body: { _invalid: true } })
                    assertEquals(r.status, 403, `${role} aal1: ${show(r)}`)
                    assert(r.text.includes('Two-factor'), `${role} aal1: ${show(r)}`)
                    assertNoLeak(r)
                }
                // Roles de campo: sin 2FA, como siempre (pasan a validación)
                for (const role of allowed.filter(r => !MFA_ROLES.has(r))) {
                    const r = await call(fn, { token: await loginAal1(SEEDED[role]), body: { _invalid: true } })
                    assertEquals(r.status, 400, `${role} aal1: ${show(r)}`)
                }
            }))

            await t.step(`${fn}: deactivated user → 403`, async () => {
                const r = await call(fn, { token: inactiveAdmin.token, body: { _invalid: true } })
                assertEquals(r.status, 403, show(r))
            })

            if (allowed.length < 8) {
                await t.step(`${fn}: role spoofed in user_metadata is ignored`, async () => {
                    const token = allowed.includes('runner') ? qcAsAdmin : runnerAsAdmin
                    const r = await call(fn, { token, body: { _invalid: true } })
                    assertEquals(r.status, 403, show(r))
                })
            }

            await t.step(`${fn}: malformed / wrong-typed / huge bodies → 4xx without leaks`, async () => {
                await checkInputValidation(fn, await seededToken(allowed.includes('admin') ? 'admin' : allowed[0]), wrongTypes)
            })

            await t.step(`${fn}: CORS`, () => checkCors(fn))
        }

        await t.step('send-push: notifying others needs a real admin/manager/team_leader role', async () => {
            const body = { action: 'send_to_user', user_id: runnerSpoofAdmin.id, title: 'x', body: 'y' }
            // qc con rol "admin" en user_metadata: sigue siendo qc
            const spoofed = await call('send-push', { token: qcAsAdmin, body })
            assertEquals(spoofed.status, 403, show(spoofed))
            for (const role of ['runner', 'qc_inspector', 'logistics', 'hr_admin', 'payroll_admin'] as Role[]) {
                const r = await call('send-push', { token: await seededToken(role), body })
                assertEquals(r.status, 403, `${role}: ${show(r)}`)
            }
        })

        // Funciones sin JWT de usuario
        await t.step('provision-orchard: CORS and validation (public endpoint)', async () => {
            await checkCors('provision-orchard')
            const xff = () => ({ 'X-Forwarded-For': `10.${RUN_IP()}` })
            const broken = await call('provision-orchard', { rawBody: '{oops', headers: xff() })
            assertCleanRejection(broken, [400, 500])
            const wrong = await call('provision-orchard', { body: { orchard_name: 5, admin_email: 'nope' }, headers: xff() })
            assertCleanRejection(wrong, 400)
            const huge = await call('provision-orchard', { body: { orchard_name: 'x'.repeat(2_000_000) }, headers: xff() })
            assertCleanRejection(huge, [400, 413])
        })

        await t.step('api-v1: CORS; user JWTs and bad API keys → 401', async () => {
            await checkCors('api-v1')
            for (const token of [null, ANON_KEY, await seededToken('admin'), 'hpnz_' + 'f'.repeat(64)]) {
                const r = await call('api-v1', { token, method: 'GET', path: '/orchards' })
                assertEquals(r.status, 401, show(r))
                assertNoLeak(r)
            }
        })
    } finally {
        await cleanupAll()
    }
} })

/** Un trozo de IP distinto por llamada: el límite de provision-orchard es por X-Forwarded-For */
function RUN_IP(): string {
    const b = crypto.getRandomValues(new Uint8Array(3))
    return `${b[0]}.${b[1]}.${b[2]}`
}
