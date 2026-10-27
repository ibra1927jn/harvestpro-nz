import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    corsHeaders,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    PayrollInputSchema,
    AuthError,
} from '../_shared/security.ts'
import { computePayroll } from '../_shared/payroll-calc.ts'
import { pieceRatesReader } from '../_shared/rates-client.ts'

// deno-lint-ignore no-explicit-any
type Client = any

/**
 * Un manager solo ve los precios de SU huerto (20261027050000): no pide la
 * nómina de otro huerto, y el «precio por cubeta» que se le enseña es el suyo
 * (en la de empresa, settings.bucket_rate sería el de un huerto cualquiera).
 */
async function managerOrchard(supabase: Client, userId: string): Promise<{ id: string | null; rate: number | null }> {
    const { data: me } = await supabase.from('users').select('orchard_id').eq('id', userId).maybeSingle()
    const id = (me?.orchard_id as string | null | undefined) ?? null
    if (!id) return { id: null, rate: null }
    const { data: own } = await supabase.from('harvest_settings').select('piece_rate').eq('orchard_id', id).maybeSingle()
    const rate = own?.piece_rate != null && Number(own.piece_rate) > 0 ? Number(own.piece_rate) : null
    return { id, rate }
}

function withBucketRate<T extends { settings?: { bucket_rate?: number } }>(result: T, rate: number | null): T {
    if (rate == null || !result?.settings) return result
    return { ...result, settings: { ...result.settings, bucket_rate: rate } }
}

serve(async (req) => {
    // ── CORS Preflight ───────────────────────────────
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth + RBAC ──────────────────────────────
        const { user, supabase, role } = await requireRole(req, ['admin', 'manager', 'payroll_admin', 'hr_admin'])
        checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 }) // Payroll is sensitive — low limit

        // ── Input Validation ─────────────────────────
        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'calculate-payroll' }, origin)
        }

        const { orchard_id, start_date, end_date } = PayrollInputSchema.parse(body)

        const manager = role === 'manager' ? await managerOrchard(supabase, user.id) : null
        if (manager && orchard_id && orchard_id !== manager.id) {
            throw new AuthError('A manager can only calculate the payroll of their own orchard', 403)
        }

        console.info(`[Payroll] Calculating ${orchard_id ? 'orchard ' + orchard_id : 'company (all orchards)'} from ${start_date} to ${end_date}`)

        // Semana cerrada: se devuelve la foto guardada al cerrar (lo que se pagó),
        // no un cálculo nuevo. Así la nómina de una semana pagada no cambia nunca.
        if (!orchard_id) {
            const { data: closed } = await supabase
                .from('pay_weeks')
                .select('week_start, week_end, status, closed_at, closed_by, snapshot')
                .eq('week_start', start_date)
                .eq('week_end', end_date)
                .eq('status', 'closed')
                .maybeSingle()
            if (closed?.snapshot) {
                const snapshot = withBucketRate(closed.snapshot, manager?.rate ?? null)
                return jsonResponse({ ...snapshot, closed: { closed_at: closed.closed_at, closed_by: closed.closed_by } }, origin)
            }
        }

        // Precios de todos los huertos con service role (la gente rota: el
        // complemento de un día se calcula con el día entero); el resto, con RLS
        const result = withBucketRate(
            await computePayroll(supabase, { orchard_id, start_date, end_date }, pieceRatesReader()),
            manager?.rate ?? null,
        )

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return errorResponse(error, origin, 'Payroll')
    }
})
