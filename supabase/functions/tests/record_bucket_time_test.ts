/**
 * record-bucket: hora de los escaneos y constancia para el manager.
 *
 * - checkScanTime (pura): futuro imposible → rechazo; reloj del móvil
 *   desfasado / escaneo antiguo → se guarda y se marca; offline de hoy → ok.
 * - Contra la función: lo rechazado y lo marcado queda en rejected_scans, que
 *   el manager del huerto puede leer (antes solo lo veía el móvil del runner).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { checkScanTime, measuredSkew } from '../_shared/scan-time.ts'
import {
    ANON_KEY, SUPABASE_URL, call, cleanupAll, makeOrchard, makePicker, makeUser, must, service, show, testOpts,
} from './_helpers.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Result = { id: string | null; status: string; reason?: string; flag?: string }

const MIN = 60_000
const NOW = Date.parse('2026-10-13T02:00:00Z') // 15:00 NZDT

Deno.test('checkScanTime: offline scans from earlier today or this week are accepted untouched', () => {
    for (const ago of [0, 3 * 60 * MIN, 26 * 60 * MIN, 5 * 24 * 60 * MIN]) {
        const at = new Date(NOW - ago).toISOString()
        assertEquals(checkScanTime(at, NOW, NOW), { verdict: 'ok', scannedAt: at })
        assertEquals(checkScanTime(at, NOW, null), { verdict: 'ok', scannedAt: at }) // móvil antiguo sin client_now
    }
    // Un par de minutos de diferencia de reloj es normal, pero nunca se guarda
    // una hora del futuro: se queda en la del servidor
    assertEquals(checkScanTime(new Date(NOW + 2 * MIN).toISOString(), NOW, NOW + 2 * MIN),
        { verdict: 'ok', scannedAt: new Date(NOW).toISOString() })
})

Deno.test('measuredSkew: the phone clock offset is stored with the scan', () => {
    assertEquals(measuredSkew(NOW, NOW - 3 * MIN, null), 3 * MIN)   // móvil 3 min atrasado
    assertEquals(measuredSkew(NOW, null, -60 * MIN), -60 * MIN)      // sin client_now: lo que corrigió el móvil
    assertEquals(measuredSkew(NOW, null, null), null)
})

Deno.test('checkScanTime: a scan in the future is rejected unless the measured phone clock explains it', () => {
    const at = new Date(NOW + 60 * MIN).toISOString()
    const r = checkScanTime(at, NOW, null)
    assertEquals(r.verdict, 'reject')
    assert(r.verdict === 'reject' && r.reason.startsWith('SCAN_TIME_IN_FUTURE'))

    // El móvil va 1 h adelantado (client_now lo dice): se guarda con la hora corregida
    const fixed = checkScanTime(at, NOW, NOW + 60 * MIN)
    assertEquals(fixed.verdict, 'flag')
    assert(fixed.verdict === 'flag' && fixed.scannedAt === new Date(NOW).toISOString() && fixed.reason.startsWith('PHONE_CLOCK_AHEAD'))

    // El móvil ya corrigió esa hora (clock_skew_ms): no se corrige dos veces
    const already = checkScanTime(new Date(NOW).toISOString(), NOW, NOW + 60 * MIN, -60 * MIN)
    assertEquals(already, { verdict: 'ok', scannedAt: new Date(NOW).toISOString() })
})

Deno.test('checkScanTime: phone clock off, or a scan days old, is saved but flagged', () => {
    const behind = checkScanTime(new Date(NOW - 3 * 60 * MIN).toISOString(), NOW, NOW - 3 * 60 * MIN)
    assertEquals(behind.verdict, 'flag')
    assert(behind.verdict === 'flag' && behind.reason.startsWith('PHONE_CLOCK_OFF') && behind.reason.includes('180 min behind'))

    const old = checkScanTime(new Date(NOW - 9 * 24 * 60 * MIN).toISOString(), NOW, NOW)
    assertEquals(old.verdict, 'flag')
    assert(old.verdict === 'flag' && old.reason.startsWith('OLD_SCAN'))

    assertEquals(checkScanTime('yesterday', NOW, NOW).verdict, 'reject')
})

Deno.test({ name: 'record-bucket reports rejected and flagged scans so the manager can see them', ...testOpts, fn: async t => {
    try {
        const orchard = await makeOrchard()
        const runner = await makeUser('runner', { orchardId: orchard })
        const manager = await makeUser('manager', { orchardId: orchard })
        const otherRunner = await makeUser('runner', { orchardId: orchard })
        const picker = await makePicker(orchard)
        const now = Date.now()
        const scan = (scannedAt: number, extra: Record<string, unknown> = {}) => ({
            id: crypto.randomUUID(), picker_id: picker.badge, orchard_id: orchard,
            scanned_at: new Date(scannedAt).toISOString(), quality_grade: 'A', ...extra,
        })

        const earlier = scan(now - 4 * 3_600_000)           // offline desde esta mañana
        const future = scan(now + 3 * 3_600_000)            // reloj 3 h adelantado, móvil antiguo
        const unknown = { ...scan(now - 60_000), picker_id: 'NO-SUCH-BADGE' }
        const old = scan(now - 9 * 86_400_000)              // semana sin cerrar, móvil sin red 9 días

        await t.step('legitimate offline scans are saved; impossible ones rejected', async () => {
            const res = await call('record-bucket', { token: runner.token, body: { scans: [earlier, future, unknown, old], client_now: now } })
            assertEquals(res.status, 200, show(res))
            const results = res.json.results as Result[]
            assertEquals(results.map(r => r.status), ['saved', 'rejected', 'rejected', 'saved'], show(res))
            assertEquals(results[0].flag, undefined)
            assert(results[1].reason?.startsWith('SCAN_TIME_IN_FUTURE'), show(res))
            assert(results[3].flag?.startsWith('OLD_SCAN'), show(res))
            const serverTime = Date.parse(String(res.json.server_time))
            assert(Math.abs(serverTime - Date.now()) < 60_000, 'server_time missing or wrong')
        })

        await t.step('the manager of the orchard sees what was rejected or flagged (other runners do not)', async () => {
            const asManager = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${manager.token}` } },
                auth: { persistSession: false },
            })
            const { data } = must(await asManager.from('rejected_scans').select('id, kind, reason, picker_code, reported_by').order('created_at'), 'manager read')
            const byId = new Map((data ?? []).map(r => [r.id as string, r]))
            assertEquals(byId.get(future.id)?.kind, 'rejected')
            assertEquals(byId.get(unknown.id)?.kind, 'rejected')
            assertEquals(byId.get(unknown.id)?.picker_code, 'NO-SUCH-BADGE')
            assertEquals(byId.get(old.id)?.kind, 'flagged')
            assertEquals(byId.get(earlier.id), undefined, 'a normal offline scan was reported')
            assertEquals(byId.get(future.id)?.reported_by, runner.id)

            const asOther = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${otherRunner.token}` } },
                auth: { persistSession: false },
            })
            const { data: otherSees } = await asOther.from('rejected_scans').select('id').in('id', [future.id, unknown.id])
            assertEquals(otherSees?.length ?? 0, 0)
        })

        await t.step('resending the same batch does not report twice', async () => {
            const again = await call('record-bucket', { token: runner.token, body: { scans: [future, unknown], client_now: Date.now() } })
            assertEquals(again.status, 200, show(again))
            const { count } = await service.from('rejected_scans').select('id', { count: 'exact', head: true }).in('id', [future.id, unknown.id])
            assertEquals(count, 2)
        })

        await t.step('phone 2 h ahead that sends client_now: saved with the corrected time and flagged', async () => {
            const phoneNow = Date.now() + 2 * 3_600_000
            const s = scan(phoneNow - 10 * 60_000)
            const r = await call('record-bucket', { token: runner.token, body: { scans: [s], client_now: phoneNow } })
            const [x] = r.json.results as Result[]
            assertEquals(x.status, 'saved', show(r))
            assert(x.flag?.startsWith('PHONE_CLOCK_AHEAD'), show(r))
            const { data } = must(await service.from('bucket_records').select('scanned_at, clock_skew_ms').eq('id', s.id).single(), 'read')
            const stored = Date.parse(data!.scanned_at as string)
            assert(Math.abs(stored - (Date.now() - 10 * 60_000)) < 2 * 60_000, `stored ${data!.scanned_at}`)
            // El desfase del móvil queda apuntado con la cubeta (servidor − móvil: −2 h)
            assert(Math.abs(Number(data!.clock_skew_ms) + 2 * 3_600_000) < 60_000, `skew ${data!.clock_skew_ms}`)
        })

        await t.step('a scan a couple of minutes ahead is stored with the server time, never in the future', async () => {
            const s = scan(Date.now() + 3 * 60_000)
            const r = await call('record-bucket', { token: runner.token, body: { scans: [s], client_now: Date.now() } })
            assertEquals((r.json.results as Result[])[0].status, 'saved', show(r))
            const { data } = must(await service.from('bucket_records').select('scanned_at, created_at').eq('id', s.id).single(), 'read')
            assert(Date.parse(data!.scanned_at as string) <= Date.parse(data!.created_at as string) + 1_000, `stored ${data!.scanned_at}`)
        })

        await t.step('single scan without a phone time: the server sets it', async () => {
            const r = await call('record-bucket', {
                token: runner.token, body: { picker_id: picker.badge, orchard_id: orchard, quality_grade: 'A' },
            })
            assertEquals(r.status, 200, show(r))
            assert(Math.abs(Date.parse(String(r.json.scanned_at)) - Date.now()) < 60_000, show(r))
        })
    } finally {
        await cleanupAll()
    }
} })
