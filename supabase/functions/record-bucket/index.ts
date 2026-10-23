import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    BucketRecordSchema,
} from '../_shared/security.ts'
import { z } from 'npm:zod@^4.3.6'
import { checkScanTime, measuredSkew } from '../_shared/scan-time.ts'

/**
 * record-bucket — Server-side bucket/scan recording
 *
 * This is the FINANCIAL LEDGER — picker pay depends on this data.
 * Moving to server-side prevents:
 * - DevTools manipulation of bucket counts
 * - Injection of fake scan records
 * - Badge ID spoofing
 *
 * Security: admin/manager/team_leader and runner (los runners son quienes escanean)
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BatchScanSchema = z.object({
    id: z.string().regex(UUID_RE, 'id must be a UUID'),
    picker_id: z.string().min(1),
    orchard_id: z.string().regex(UUID_RE, 'orchard_id must be a UUID (scan made before the orchard was loaded)'),
    row_number: z.number().int().positive().optional().nullable(),
    quality_grade: z.enum(['A', 'B', 'C', 'reject']).optional(),
    bin_id: z.string().optional().nullable(),
    scanned_by: z.string().regex(UUID_RE).optional().nullable(),
    scanned_at: z.string().min(10),
    /** Corrección (ms) que el móvil ya sumó a scanned_at con el desfase conocido */
    clock_skew_ms: z.number().int().optional().nullable(),
})

type Report = {
    id: string
    picker_code: string
    picker_id: string | null
    scanned_at: string | null
    quality_grade: string | null
    kind: 'rejected' | 'flagged'
    reason: string
}

/**
 * Deja constancia para el manager (tabla rejected_scans) de lo rechazado y de
 * lo guardado con hora dudosa. Con el JWT de quien escanea (RLS: lo suyo, su
 * huerto). Idempotente por id. Si falla no se rompe la subida: solo se avisa.
 * defaultToNull: false → orchard_id y reported_by toman su DEFAULT (huerto y
 * usuario del JWT); sin eso PostgREST los manda a NULL y el RLS lo rechaza.
 */
// deno-lint-ignore no-explicit-any
async function reportScans(supabase: any, reports: Report[]): Promise<void> {
    if (reports.length === 0) return
    const rows = reports.map(r => ({ ...r, reason: r.reason.slice(0, 500) }))
    const { error } = await supabase.from('rejected_scans').upsert(rows, { onConflict: 'id', ignoreDuplicates: true, defaultToNull: false })
    if (error) console.warn(`[record-bucket] Could not report ${rows.length} rejected/flagged scan(s): ${error.message}`)
}

/** Tarjeta → persona, en toda la empresa (si se repite, gana este huerto) */
// deno-lint-ignore no-explicit-any
async function resolveBadge(supabase: any, code: string, orchardId: string): Promise<string | null> {
    const { data, error } = await supabase.from('pickers').select('id, orchard_id').eq('picker_id', code).is('deleted_at', null)
    if (error) throw new Error(`Badge lookup failed: ${error.message}`)
    const list = (data ?? []) as { id: string; orchard_id: string | null }[]
    const match = list.length === 1 ? list[0] : list.find(m => m.orchard_id === orchardId)
    return match?.id ?? null
}

/** Choques entre transacciones (interbloqueo, serialización): se arreglan reintentando al momento */
function isTransientConflict(code: string): boolean {
    return code === '40P01' || code === '40001'
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Errores que no se arreglan reintentando: datos (22xxx), integridad (23xxx), RLS, triggers */
function isPermanent(code: string): boolean {
    return code.startsWith('22') || code.startsWith('23') || code === '42501' || code === 'P0001'
}

type InsertOutcome = { status: 'saved' | 'duplicate' | 'rejected' | 'retry'; reason?: string }

/**
 * Inserta un escaneo del lote. Idempotente por id: si el id ya existe es
 * "duplicate". La restricción única (picker_id, scanned_at) NO identifica el
 * escaneo: el móvil guarda la hora al segundo y dos cubetas de la misma persona
 * en el mismo segundo (modo lote, dos runners) son cubetas distintas. Antes la
 * segunda volvía como "duplicate" y el móvil la daba por subida: se perdía de la
 * paga sin aviso. Ahora se guarda desplazando la hora unos milisegundos.
 */
// deno-lint-ignore no-explicit-any
async function insertScan(supabase: any, row: Record<string, unknown> & { scanned_at: string }): Promise<InsertOutcome> {
    const base = Date.parse(row.scanned_at)
    let conflicts = 0
    for (let shift = 0; shift < 50; shift++) {
        const scannedAt = shift === 0 || Number.isNaN(base) ? row.scanned_at : new Date(base + shift).toISOString()
        const { error } = await supabase.from('bucket_records').insert({ ...row, scanned_at: scannedAt })
        if (!error) return { status: 'saved' }
        const code = error.code ?? ''
        // Interbloqueo con otro lote que guarda las mismas cubetas: reintentar el
        // mismo instante (hasta 3 veces) en vez de devolver "retry" al móvil
        if (isTransientConflict(code) && conflicts < 3) {
            conflicts++
            shift--
            await sleep(20 + Math.random() * 80)
            continue
        }
        if (code === '23505') {
            const text = `${error.message ?? ''} ${error.details ?? ''}`
            if (text.includes('picker_scan_unique') && !Number.isNaN(base)) continue
            return { status: 'duplicate' }
        }
        // Los triggers (día/semana de pago cerrados) saltan ANTES que la clave
        // única: un reenvío de algo ya guardado volvía "rejected" aunque la
        // cubeta está en la tabla (y pagada). Si el id ya existe es "duplicate".
        const { data: existing } = await supabase.from('bucket_records').select('id').eq('id', row.id).maybeSingle()
        if (existing) return { status: 'duplicate' }
        // Errores de datos o de permisos (42501: RLS, p. ej. otro huerto o persona
        // archivada) → rechazo definitivo; el resto (BD caída…) → reintentar luego.
        return { status: isPermanent(code) ? 'rejected' : 'retry', reason: error.message }
    }
    return { status: 'rejected', reason: 'TOO_MANY_SCANS_SAME_SECOND' }
}

serve(async (req) => {
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'team_leader', 'runner'])
        checkRateLimit(user.id, { maxRequests: 120, windowMs: 60_000 }) // Higher limit for rapid scanning

        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        // El auth check de arriba garantiza que solo usuarios autenticados pueden hacer warmup.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'record-bucket' }, origin)
        }

        // ── Lote (móvil que vuelve a tener conexión) ─────────────
        // { scans: [...] }: cada escaneo trae su id (generado en el móvil). Si ya
        // se guardó en un intento anterior, cuenta como guardado (sin duplicar).
        // Un rechazo definitivo (semana cerrada, tarjeta desconocida) vuelve con
        // su motivo para no reintentarlo para siempre.
        if (Array.isArray(body?.scans)) {
            const scans = body.scans.slice(0, 200) as unknown[]
            type ScanResult = { id: string | null; status: 'saved' | 'duplicate' | 'rejected' | 'retry'; reason?: string; flag?: string }
            // Un hueco por escaneo recibido: la respuesta sale en el mismo orden que el lote
            const results: ScanResult[] = new Array(scans.length)
            const badgeCache = new Map<string, string | null>()
            const reports: Report[] = []
            const serverNow = Date.now()
            const clientNow = typeof body.client_now === 'number' ? body.client_now : null
            // 1.ª pasada: validar y resolver tarjetas; las filas buenas se insertan
            // juntas (1 viaje a la BD en vez de 1 por cubeta). Si el lote falla
            // entero (trigger de día/semana cerrados, dos cubetas en el mismo
            // milisegundo…) se vuelve al camino de una en una de siempre.
            const ready: { idx: number; row: Record<string, unknown> & { id: string; scanned_at: string }; pickerId: string; time: ReturnType<typeof checkScanTime> }[] = []
            for (const [idx, raw] of scans.entries()) {
                const scanId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : null
                const r = (raw ?? {}) as Record<string, unknown>
                const report = (kind: Report['kind'], reason: string, pickerId: string | null, scannedAt?: string) => {
                    if (!scanId || !UUID_RE.test(scanId)) return
                    reports.push({
                        id: scanId,
                        picker_code: String(r.picker_id ?? '?').slice(0, 100),
                        picker_id: pickerId,
                        scanned_at: scannedAt ?? (typeof r.scanned_at === 'string' && !Number.isNaN(Date.parse(r.scanned_at)) ? r.scanned_at : null),
                        quality_grade: typeof r.quality_grade === 'string' ? r.quality_grade : null,
                        kind,
                        reason,
                    })
                }
                let resolvedPicker: string | null = null
                try {
                    const s = BatchScanSchema.parse(raw)
                    // Hora creíble (ver _shared/scan-time.ts): futuro imposible → rechazo
                    const time = checkScanTime(s.scanned_at, serverNow, clientNow, s.clock_skew_ms ?? 0)
                    if (time.verdict === 'reject') throw new Error(time.reason)
                    let pickerId = s.picker_id
                    if (!UUID_RE.test(pickerId)) {
                        if (!badgeCache.has(pickerId)) badgeCache.set(pickerId, await resolveBadge(supabase, pickerId, s.orchard_id))
                        const resolved = badgeCache.get(pickerId)
                        if (!resolved) throw new Error(`UNKNOWN_BADGE: "${pickerId}"`)
                        pickerId = resolved
                    }
                    resolvedPicker = pickerId
                    const row = {
                        id: s.id,
                        picker_id: pickerId,
                        orchard_id: s.orchard_id,
                        row_number: s.row_number,
                        quality_grade: s.quality_grade,
                        bin_id: s.bin_id,
                        scanned_by: s.scanned_by ?? user.id,
                        scanned_at: time.scannedAt,
                        // Desfase del reloj del móvil, apuntado con la cubeta
                        clock_skew_ms: measuredSkew(serverNow, clientNow, s.clock_skew_ms),
                    }
                    ready.push({ idx, row, pickerId, time })
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    const transient = msg.startsWith('Badge lookup failed')
                    if (!transient) report('rejected', msg, resolvedPicker)
                    results[idx] = { id: scanId, status: transient ? 'retry' : 'rejected', reason: msg }
                }
            }
            // 2.ª pasada: inserción en bloque, idempotente por id
            // Filas únicas y ordenadas por id: dos lotes iguales en paralelo (reintento,
            // dos pestañas) toman los bloqueos en el mismo orden. Si aun así choca
            // (40P01) se reintenta una vez; si no, se va al camino de una en una,
            // que también reintenta los choques. Todo es idempotente por id.
            let bulkSaved: Set<string> | null = null
            const firstById = new Map<string, typeof ready[number]['row']>()
            for (const x of ready) if (!firstById.has(x.row.id)) firstById.set(x.row.id, x.row)
            const uniqueRows = [...firstById.values()]
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            if (uniqueRows.length > 1) {
                for (let attempt = 0; attempt < 2 && !bulkSaved; attempt++) {
                    const { data, error } = await supabase
                        .from('bucket_records')
                        .upsert(uniqueRows, { onConflict: 'id', ignoreDuplicates: true })
                        .select('id')
                    if (!error) bulkSaved = new Set(((data ?? []) as { id: string }[]).map(d => d.id))
                    else if (!isTransientConflict(error.code ?? '')) break
                    else await sleep(20 + Math.random() * 80)
                }
            }
            const seenIds = new Set<string>()
            for (const { idx, row, pickerId, time } of ready) {
                // El mismo id dos veces en el lote: la segunda es un reenvío
                const repeated = seenIds.has(row.id)
                seenIds.add(row.id)
                // En bloque: lo que no volvió ya existía (reenvío) → duplicate
                const outcome: InsertOutcome = repeated
                    ? { status: 'duplicate' }
                    : bulkSaved
                        ? { status: bulkSaved.has(row.id) ? 'saved' : 'duplicate' }
                        : await insertScan(supabase, row)
                if (outcome.status !== 'saved') {
                    if (outcome.status === 'rejected') {
                        const r = (scans.find(x => (x as { id?: string })?.id === row.id) ?? {}) as Record<string, unknown>
                        reports.push({
                            id: row.id,
                            picker_code: String(r.picker_id ?? '?').slice(0, 100),
                            picker_id: pickerId,
                            scanned_at: row.scanned_at,
                            quality_grade: typeof row.quality_grade === 'string' ? row.quality_grade : null,
                            kind: 'rejected',
                            reason: outcome.reason ?? 'Rejected',
                        })
                    }
                    results[idx] = { id: row.id, ...outcome }
                    continue
                }
                if (time.verdict === 'flag') {
                    const r = (scans.find(x => (x as { id?: string })?.id === row.id) ?? {}) as Record<string, unknown>
                    reports.push({
                        id: row.id,
                        picker_code: String(r.picker_id ?? '?').slice(0, 100),
                        picker_id: pickerId,
                        scanned_at: time.scannedAt,
                        quality_grade: typeof row.quality_grade === 'string' ? row.quality_grade : null,
                        kind: 'flagged',
                        reason: time.reason,
                    })
                    results[idx] = { id: row.id, status: 'saved', flag: time.reason }
                } else {
                    results[idx] = { id: row.id, status: 'saved' }
                }
            }
            await reportScans(supabase, reports)
            const saved = results.filter(x => x.status === 'saved' || x.status === 'duplicate').length
            console.info(`[record-bucket] Batch: ${saved}/${results.length} stored by ${user.id}`)
            // server_time: el móvil mide el desfase de su reloj y corrige los escaneos
            return jsonResponse({ results, server_time: new Date(serverNow).toISOString() }, origin)
        }

        const input = BucketRecordSchema.parse(body)

        let finalPickerId = input.picker_id

        // ── Badge-to-UUID Resolution ─────────────────
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(finalPickerId)) {
            // Tarjeta → persona. La gente rota entre huertos de la empresa: se busca
            // en toda la plantilla; si el código se repitiera, gana el de este huerto.
            const { data: matches, error: lookupErr } = await supabase
                .from('pickers')
                .select('id, orchard_id')
                .eq('picker_id', finalPickerId)
                .is('deleted_at', null)

            if (lookupErr) throw new Error(`Badge lookup failed: ${lookupErr.message}`)

            const list = (matches ?? []) as { id: string; orchard_id: string | null }[]
            const picker = list.length === 1 ? list[0] : list.find(m => m.orchard_id === input.orchard_id)

            if (!picker) {
                // EXACT MATCH ONLY — no fuzzy matching for financial safety
                throw new Error(
                    `Unknown badge ID: "${finalPickerId}". ` +
                    `No picker found with this exact ID in the orchard.`
                )
            }

            finalPickerId = picker.id
        }

        // ── Insert Bucket Record ─────────────────────
        // La hora la pone el servidor. Si el móvil manda la suya (cola sin red),
        // se comprueba y corrige igual que en el lote y se apunta su desfase.
        const serverNow = Date.now()
        const clientNow = typeof input.client_now === 'number' ? input.client_now : null
        let scannedAt = new Date(serverNow).toISOString()
        let clockSkewMs: number | null = null
        if (input.scanned_at) {
            const time = checkScanTime(input.scanned_at, serverNow, clientNow, input.clock_skew_ms ?? 0)
            if (time.verdict === 'reject') throw new Error(time.reason)
            scannedAt = time.scannedAt
            clockSkewMs = measuredSkew(serverNow, clientNow, input.clock_skew_ms)
        }

        const { data: record, error: insertErr } = await supabase
            .from('bucket_records')
            .insert({
                picker_id: finalPickerId,
                orchard_id: input.orchard_id,
                row_number: input.row_number,
                quality_grade: input.quality_grade,
                bin_id: input.bin_id,
                scanned_by: input.scanned_by ?? user.id,
                scanned_at: scannedAt,
                clock_skew_ms: clockSkewMs,
            })
            .select('id, picker_id, scanned_at')
            .single()

        if (insertErr) {
            throw new Error(`Failed to record bucket: ${insertErr.message}`)
        }

        console.info(`[record-bucket] Recorded: picker=${finalPickerId}, row=${input.row_number}, by=${user.id}`)

        return jsonResponse({
            id: record.id,
            picker_id: record.picker_id,
            scanned_at: record.scanned_at,
            resolved_from_badge: finalPickerId !== input.picker_id,
        }, origin)

    } catch (error) {
        return errorResponse(error, origin, 'record-bucket')
    }
})
