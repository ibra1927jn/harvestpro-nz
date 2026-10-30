import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { fetchAllRows } from '../_shared/fetch-all-rows.ts'
import {
    handlePreflight,
    corsHeaders,
    requireRole,
    errorResponse,
    checkRateLimit,
    AnomalyInputSchema,
} from '../_shared/security.ts'

/**
 * detect-anomalies — Server-side Fraud Detection Edge Function
 *
 * Implements 4 anomaly rules that CANNOT be bypassed from the client:
 * 1. Elapsed-velocity: buckets ÷ time since last collection > physical max
 * 2. Peer comparison: picker rate > 3× row average
 * 3. Off-hours: scans outside shift window
 * 4. Duplicate proximity: same bin scanned by 2 pickers within 2 min
 */

// ── Detection Configuration ──────────────────────────
interface DetectionConfig {
    gracePeriodMinutes: number
    peerOutlierThreshold: number
    maxPhysicalRate: number
    postCollectionWindowMinutes: number
    shiftStartHour: number
    shiftEndHour: number
    /** Dos cubetas de la MISMA persona con menos de esto: escaneo repetido o tarjeta compartida */
    duplicateWindowSeconds: number
    /** Tope de anomalías en la respuesta (las cuentas de stats son las totales) */
    maxAnomaliesReturned: number
}

const CONFIG: DetectionConfig = {
    gracePeriodMinutes: 90,
    peerOutlierThreshold: 3.0,
    maxPhysicalRate: 8,
    postCollectionWindowMinutes: 20,
    shiftStartHour: 6,
    shiftEndHour: 19,
    duplicateWindowSeconds: 60,
    maxAnomaliesReturned: 200,
}

// ── Types ────────────────────────────────────────────
type AnomalyType =
    | 'impossible_velocity'
    | 'peer_outlier'
    | 'off_hours'
    | 'duplicate_proximity'
    | 'post_collection_spike'

interface Anomaly {
    id: string
    type: AnomalyType
    severity: 'low' | 'medium' | 'high'
    pickerId: string
    pickerName: string
    detail: string
    timestamp: string
    evidence: Record<string, unknown>
    rule: 'elapsed_velocity' | 'peer_comparison' | 'off_hours' | 'duplicate'
}

interface BucketEvent {
    id: string
    picker_id: string
    row_number: number | null
    recorded_at: string
    pickerName: string
}

// ── Hora de Nueva Zelanda ────────────────────────────
// El runtime corre en UTC: getHours()/setHours() daban horas UTC, así que el
// "fuera de turno" (6–19 h) y el "hoy" estaban desplazados 12–13 horas.
const NZ_PARTS = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})

function nzParts(d: Date): { date: string; hour: number } {
    const p = Object.fromEntries(NZ_PARTS.formatToParts(d).map(x => [x.type, x.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

/** Instante de una hora NZ (hh:00) de un día NZ */
function nzInstant(dateYMD: string, hour: number): Date {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
        .formatToParts(new Date(`${dateYMD}T12:00:00Z`))
        .find(x => x.type === 'timeZoneName')?.value.replace('GMT', '') || '+13:00'
    return new Date(`${dateYMD}T${String(hour).padStart(2, '0')}:00:00${offset}`)
}

serve(async (req) => {
    // ── CORS Preflight ───────────────────────────────
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth + RBAC ──────────────────────────────
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'team_leader'])
        checkRateLimit(user.id)

        // ── Input Validation ─────────────────────────
        const body = await req.json()
        const { orchard_id } = AnomalyInputSchema.parse(body)

        // Día de hoy en hora NZ
        const now = new Date()
        const today = nzParts(now).date
        const dayStart = nzInstant(today, 0)
        const dayEnd = new Date(nzInstant(today, 12).getTime() + 12 * 3_600_000)

        // Cubetas de hoy con el nombre de la persona. Antes leía la tabla
        // bucket_events, que no existe: la función daba siempre 400 y el panel
        // de anomalías del manager salía vacío.
        // Paginado: un huerto hace ~3.000 cubetas al día y PostgREST corta en
        // 1000 (antes solo se miraban las de la mañana; prueba de carga 2026-10-21)
        type Row = { id: string; picker_id: string; row_number: number | null; scanned_at: string; pickers: { name: string } | { name: string }[] | null }
        let rows: Row[]
        try {
            rows = await fetchAllRows<Row>((from, to) => supabase
                .from('bucket_records')
                .select('id, picker_id, row_number, scanned_at, pickers(name)')
                .eq('orchard_id', orchard_id)
                .is('deleted_at', null)
                .gte('scanned_at', dayStart.toISOString())
                .lt('scanned_at', dayEnd.toISOString())
                .order('scanned_at', { ascending: true })
                .order('id')
                .range(from, to))
        } catch (eventsError) {
            throw new Error(`Failed to fetch events: ${(eventsError as { message?: string })?.message ?? eventsError}`)
        }
        const events: BucketEvent[] = ((rows ?? []) as Row[]).map(r => ({
            id: r.id,
            picker_id: r.picker_id,
            row_number: r.row_number,
            recorded_at: r.scanned_at,
            pickerName: (Array.isArray(r.pickers) ? r.pickers[0]?.name : r.pickers?.name) || 'Unknown',
        }))
        if (events.length === 0) {
            return new Response(JSON.stringify({ anomalies: [], stats: { total: 0 } }), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
            })
        }

        const anomalies: Anomaly[] = []
        let anomalyCounter = 0

        const makeId = () => `anm-${++anomalyCounter}-${Date.now()}`

        // ── Group events by picker ────────────────────
        const pickerEvents = new Map<string, BucketEvent[]>()
        const pickerNames = new Map<string, string>()

        for (const event of events) {
            const pid = event.picker_id
            pickerNames.set(pid, event.pickerName)
            if (!pickerEvents.has(pid)) pickerEvents.set(pid, [])
            pickerEvents.get(pid)!.push(event)
        }

        // ── Rule 1: Off-Hours Detection ──────────────
        for (const [pickerId, pEvents] of pickerEvents) {
            for (const event of pEvents) {
                const scanTime = new Date(event.recorded_at)
                const hour = nzParts(scanTime).hour
                if (hour < CONFIG.shiftStartHour || hour >= CONFIG.shiftEndHour) {
                    anomalies.push({
                        id: makeId(),
                        type: 'off_hours',
                        severity: 'medium',
                        pickerId,
                        pickerName: pickerNames.get(pickerId) || 'Unknown',
                        detail: `Scan at ${scanTime.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Pacific/Auckland' })} — outside shift window (${CONFIG.shiftStartHour}:00-${CONFIG.shiftEndHour}:00).`,
                        timestamp: event.recorded_at,
                        evidence: {
                            scanTime: scanTime.toISOString(),
                            shiftStart: `${CONFIG.shiftStartHour}:00`,
                            shiftEnd: `${CONFIG.shiftEndHour}:00`,
                        },
                        rule: 'off_hours',
                    })
                    break // Only flag once per picker per day
                }
            }
        }

        // ── Rule 2: Impossible Velocity ──────────────
        for (const [pickerId, pEvents] of pickerEvents) {
            if (pEvents.length < 2) continue

            const firstScan = new Date(pEvents[0].recorded_at)
            const lastScan = new Date(pEvents[pEvents.length - 1].recorded_at)
            const hoursElapsed = (lastScan.getTime() - firstScan.getTime()) / (1000 * 60 * 60)

            if (hoursElapsed < 0.1) continue

            const rate = pEvents.length / hoursElapsed

            const shiftStart = nzInstant(today, CONFIG.shiftStartHour)
            const minutesSinceShiftStart = (firstScan.getTime() - shiftStart.getTime()) / (1000 * 60)
            const inGracePeriod = minutesSinceShiftStart < CONFIG.gracePeriodMinutes

            const threshold = inGracePeriod
                ? CONFIG.maxPhysicalRate * 2.5
                : CONFIG.maxPhysicalRate

            if (rate > threshold) {
                anomalies.push({
                    id: makeId(),
                    type: 'impossible_velocity',
                    severity: rate > CONFIG.maxPhysicalRate * 2 ? 'high' : 'medium',
                    pickerId,
                    pickerName: pickerNames.get(pickerId) || 'Unknown',
                    detail: `${pEvents.length} buckets in ${(hoursElapsed * 60).toFixed(0)} min (${rate.toFixed(1)}/hr). Physical max: ${CONFIG.maxPhysicalRate}/hr.${inGracePeriod ? ' Grace period active — flagged as extreme outlier.' : ''}`,
                    timestamp: lastScan.toISOString(),
                    evidence: {
                        buckets: pEvents.length,
                        minutesWorked: Math.round(hoursElapsed * 60),
                        impliedRate: parseFloat(rate.toFixed(1)),
                        maxPhysicalRate: CONFIG.maxPhysicalRate,
                        inGracePeriod,
                    },
                    rule: 'elapsed_velocity',
                })
            }
        }

        // ── Rule 3: Peer Comparison (by row) ─────────
        const rowGroups = new Map<number, { pickerId: string; rate: number; buckets: number }[]>()

        for (const [pickerId, pEvents] of pickerEvents) {
            const rowCounts = new Map<number, number>()
            for (const ev of pEvents) {
                if (ev.row_number != null) {
                    rowCounts.set(ev.row_number, (rowCounts.get(ev.row_number) || 0) + 1)
                }
            }

            if (rowCounts.size === 0) continue

            let dominantRow = 0
            let maxCount = 0
            for (const [row, count] of rowCounts) {
                if (count > maxCount) { dominantRow = row; maxCount = count }
            }

            const firstScan = new Date(pEvents[0].recorded_at)
            const lastScan = new Date(pEvents[pEvents.length - 1].recorded_at)
            const hours = (lastScan.getTime() - firstScan.getTime()) / (1000 * 60 * 60)
            if (hours < 0.5) continue

            const rate = pEvents.length / hours

            if (!rowGroups.has(dominantRow)) rowGroups.set(dominantRow, [])
            rowGroups.get(dominantRow)!.push({ pickerId, rate, buckets: pEvents.length })
        }

        for (const [rowNum, pickers] of rowGroups) {
            if (pickers.length < 2) continue

            const avgRate = pickers.reduce((sum, p) => sum + p.rate, 0) / pickers.length

            for (const picker of pickers) {
                const multiplier = picker.rate / avgRate
                if (multiplier >= CONFIG.peerOutlierThreshold) {
                    const peers = pickers
                        .filter(p => p.pickerId !== picker.pickerId)
                        .map(p => `${pickerNames.get(p.pickerId)} (${p.rate.toFixed(1)}/hr)`)

                    anomalies.push({
                        id: makeId(),
                        type: 'peer_outlier',
                        severity: multiplier >= 4 ? 'high' : 'medium',
                        pickerId: picker.pickerId,
                        pickerName: pickerNames.get(picker.pickerId) || 'Unknown',
                        detail: `${picker.rate.toFixed(1)} bins/hr while row mates average ${avgRate.toFixed(1)}/hr (${multiplier.toFixed(1)}× faster). Same trees, same conditions.`,
                        timestamp: now.toISOString(),
                        evidence: {
                            pickerRate: parseFloat(picker.rate.toFixed(1)),
                            rowAverage: parseFloat(avgRate.toFixed(1)),
                            multiplier: parseFloat(multiplier.toFixed(1)),
                            rowId: `Row ${rowNum}`,
                            rowPeers: peers,
                        },
                        rule: 'peer_comparison',
                    })
                }
            }
        }

        // ── Rule 4: Escaneo repetido (misma persona) ──
        // Antes: dos personas DISTINTAS en la misma fila con menos de 2 min.
        // Eso es lo normal (la cuadrilla entera trabaja junta en 2 filas): con 80
        // personas salían decenas de miles de "posibles tarjetas compartidas" al
        // día, la respuesta pesaba ~30 MB y tardaba 10-16 s (prueba de carga
        // 2026-10-21). Ahora: la MISMA persona con dos cubetas en menos de
        // duplicateWindowSeconds (llenar una cubeta lleva minutos) → una
        // anomalía por persona con cuántas veces pasó.
        for (const [pickerId, pEvents] of pickerEvents) {
            let repeats = 0
            let first: { a: BucketEvent; b: BucketEvent; gap: number } | null = null
            for (let i = 1; i < pEvents.length; i++) {
                const gap = new Date(pEvents[i].recorded_at).getTime() - new Date(pEvents[i - 1].recorded_at).getTime()
                if (gap >= 0 && gap < CONFIG.duplicateWindowSeconds * 1000) {
                    repeats++
                    if (!first) first = { a: pEvents[i - 1], b: pEvents[i], gap }
                }
            }
            if (repeats > 0 && first) {
                anomalies.push({
                    id: makeId(),
                    type: 'duplicate_proximity',
                    severity: repeats >= 3 ? 'high' : 'medium',
                    pickerId,
                    pickerName: pickerNames.get(pickerId) || 'Unknown',
                    detail: `${repeats} bucket${repeats > 1 ? 's' : ''} scanned less than ${CONFIG.duplicateWindowSeconds}s after the previous one for the same person (first: ${Math.round(first.gap / 1000)}s apart). Possible double scan or shared tag.`,
                    timestamp: first.b.recorded_at,
                    evidence: {
                        repeats,
                        firstGapSeconds: Math.round(first.gap / 1000),
                        rowNumber: first.b.row_number,
                        windowSeconds: CONFIG.duplicateWindowSeconds,
                    },
                    rule: 'duplicate',
                })
            }
        }

        // Sort by severity (high first)
        const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
        anomalies.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))

        console.info(`[detect-anomalies] Found ${anomalies.length} anomalies for orchard ${orchard_id}`)

        return new Response(JSON.stringify({
            anomalies: anomalies.slice(0, CONFIG.maxAnomaliesReturned),
            stats: {
                total: anomalies.length,
                high: anomalies.filter(a => a.severity === 'high').length,
                medium: anomalies.filter(a => a.severity === 'medium').length,
                low: anomalies.filter(a => a.severity === 'low').length,
            },
        }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return errorResponse(error, origin, 'detect-anomalies')
    }
})
