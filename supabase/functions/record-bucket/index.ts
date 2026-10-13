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
})

/** Tarjeta → persona, en toda la empresa (si se repite, gana este huerto) */
// deno-lint-ignore no-explicit-any
async function resolveBadge(supabase: any, code: string, orchardId: string): Promise<string | null> {
    const { data, error } = await supabase.from('pickers').select('id, orchard_id').eq('picker_id', code).is('deleted_at', null)
    if (error) throw new Error(`Badge lookup failed: ${error.message}`)
    const list = (data ?? []) as { id: string; orchard_id: string | null }[]
    const match = list.length === 1 ? list[0] : list.find(m => m.orchard_id === orchardId)
    return match?.id ?? null
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
            const results: { id: string | null; status: 'saved' | 'duplicate' | 'rejected' | 'retry'; reason?: string }[] = []
            const badgeCache = new Map<string, string | null>()
            for (const raw of scans) {
                const scanId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : null
                try {
                    const s = BatchScanSchema.parse(raw)
                    let pickerId = s.picker_id
                    if (!UUID_RE.test(pickerId)) {
                        if (!badgeCache.has(pickerId)) badgeCache.set(pickerId, await resolveBadge(supabase, pickerId, s.orchard_id))
                        const resolved = badgeCache.get(pickerId)
                        if (!resolved) throw new Error(`UNKNOWN_BADGE: "${pickerId}"`)
                        pickerId = resolved
                    }
                    const { error } = await supabase.from('bucket_records').insert({
                        id: s.id,
                        picker_id: pickerId,
                        orchard_id: s.orchard_id,
                        row_number: s.row_number,
                        quality_grade: s.quality_grade,
                        bin_id: s.bin_id,
                        scanned_by: s.scanned_by ?? user.id,
                        scanned_at: s.scanned_at,
                    })
                    if (error) {
                        if (error.code === '23505') { results.push({ id: s.id, status: 'duplicate' }); continue }
                        // Errores de datos o de permisos (42501: RLS, p. ej. otro huerto o persona
                        // archivada) → rechazo definitivo; el resto (BD caída…) → reintentar luego.
                        // Antes 42501 volvía como "retry" y el móvil lo reintentaba para siempre.
                        const permanent = ['P0001', '23503', '23514', '22P02', '22007', '23502', '42501'].includes(error.code ?? '')
                        results.push({ id: s.id, status: permanent ? 'rejected' : 'retry', reason: error.message })
                        continue
                    }
                    results.push({ id: s.id, status: 'saved' })
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    const transient = msg.startsWith('Badge lookup failed')
                    results.push({ id: scanId, status: transient ? 'retry' : 'rejected', reason: msg })
                }
            }
            const saved = results.filter(x => x.status === 'saved' || x.status === 'duplicate').length
            console.info(`[record-bucket] Batch: ${saved}/${results.length} stored by ${user.id}`)
            return jsonResponse({ results }, origin)
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
        const scannedAt = input.scanned_at || new Date().toISOString()

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
