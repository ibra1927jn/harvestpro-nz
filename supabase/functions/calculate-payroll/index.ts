import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    handlePreflight,
    corsHeaders,
    requireRole,
    errorResponse,
    jsonResponse,
    checkRateLimit,
    PayrollInputSchema,
} from '../_shared/security.ts'
import { computePayroll } from '../_shared/payroll-calc.ts'

serve(async (req) => {
    // ── CORS Preflight ───────────────────────────────
    const preflight = handlePreflight(req)
    if (preflight) return preflight

    const origin = req.headers.get('Origin')

    try {
        // ── Auth + RBAC ──────────────────────────────
        const { user, supabase } = await requireRole(req, ['admin', 'manager', 'payroll_admin', 'hr_admin'])
        checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 }) // Payroll is sensitive — low limit

        // ── Input Validation ─────────────────────────
        const body = await req.json()

        // Keep-alive warmup — retorna inmediatamente para mantener el worker caliente.
        if (body?._warmup === true) {
            return jsonResponse({ status: 'warm', function: 'calculate-payroll' }, origin)
        }

        const { orchard_id, start_date, end_date } = PayrollInputSchema.parse(body)

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
                return jsonResponse({ ...closed.snapshot, closed: { closed_at: closed.closed_at, closed_by: closed.closed_by } }, origin)
            }
        }

        const result = await computePayroll(supabase, { orchard_id, start_date, end_date })

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return errorResponse(error, origin, 'Payroll')
    }
})
