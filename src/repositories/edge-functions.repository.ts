/**
 * Edge Functions Repository — Supabase Edge Function invocation wrapper
 *
 * All calls go through gatewayService.withResilience() for automatic
 * retry with exponential backoff on 502/504/timeout errors.
 */
import { supabase } from '@/services/supabase';
import { gatewayService, GatewayOptions } from '@/services/gateway.service';

/**
 * Error con el motivo real que devuelve la función (campo hint/error), en vez
 * del genérico "Edge Function returned a non-2xx status code". Los errores de
 * servidor (5xx) conservan su código para que se reintenten.
 */
export async function readableError(error: { message?: string; context?: unknown }, functionName: string): Promise<Error> {
    const fallback = error.message || `Edge Function ${functionName} failed`;
    const ctx = error.context;
    if (!(ctx instanceof Response)) return new Error(fallback);
    if (ctx.status >= 500 || ctx.status === 429) return new Error(`${fallback} (${ctx.status})`);
    try {
        const json = await ctx.clone().json() as { hint?: string; error?: string };
        const reason = json?.hint || json?.error;
        if (reason) return Object.assign(new Error(reason), { status: ctx.status });
    } catch { /* cuerpo sin JSON */ }
    return new Error(fallback);
}

export const edgeFunctionsRepository = {
    /** Invoke a Supabase Edge Function with gateway resilience */
    async invoke<T = unknown>(
        functionName: string,
        body: Record<string, unknown>,
        options?: Partial<GatewayOptions>
    ): Promise<{ data: T | null; error: { message: string } | null }> {
        return gatewayService.withResilience(
            async () => {
                const { data, error } = await supabase.functions.invoke(functionName, { body });
                if (error) throw await readableError(error, functionName);
                return { data: data as T | null, error: null };
            },
            { operationName: functionName, ...options }
        );
    },
};
