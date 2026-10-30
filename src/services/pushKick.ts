/**
 * pushKick — Tras escribir algo que avisa a otra persona (inspección de QC,
 * aviso, transporte, ausencia, mensaje, rechazo de nómina), se despierta
 * send-push en modo «flush» para que el aviso salga ya y no al minuto (pg_cron).
 *
 * No lleva datos del mensaje: el aviso lo escribió el trigger de la base en
 * notification_outbox. Lo engancha el fetch del cliente de Supabase
 * (services/supabase.ts), así cubre también lo que sube la cola sin red.
 */

/** Tablas cuyas altas/cambios disparan avisos (triggers de 20261023060000) */
const EVENT_TABLES = ['qc_inspections', 'broadcasts', 'transport_requests', 'leave_requests', 'chat_messages'];
/** Edge Functions que escriben eventos (approve-timesheet: nómina rechaza una hoja) */
const EVENT_FUNCTIONS = ['approve-timesheet'];

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT']);
const DEBOUNCE_MS = 1500;

export function isPushEventRequest(url: string, method: string | undefined): boolean {
    if (!WRITE_METHODS.has((method ?? 'GET').toUpperCase())) return false;
    let path: string;
    try {
        path = new URL(url, 'http://local').pathname;
    } catch {
        return false;
    }
    const rest = /\/rest\/v1\/([^/?]+)$/.exec(path);
    if (rest) return EVENT_TABLES.includes(rest[1]);
    const fn = /\/functions\/v1\/([^/?]+)$/.exec(path);
    return !!fn && EVENT_FUNCTIONS.includes(fn[1]);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Una sola llamada por ráfaga de escrituras; nunca lanza */
export function schedulePushFlush(flush: () => Promise<unknown>): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        flush().catch(() => undefined);
    }, DEBOUNCE_MS);
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string | undefined } {
    if (typeof input === 'string') return { url: input, method: init?.method };
    if (input instanceof URL) return { url: input.href, method: init?.method };
    return { url: input.url, method: init?.method ?? input.method };
}

/** fetch del cliente de Supabase: igual que fetch, y avisa a send-push tras una escritura de evento */
export function pushAwareFetch(flush: () => Promise<unknown>): typeof fetch {
    return async (input, init) => {
        const response = await fetch(input, init);
        try {
            const { url, method } = requestInfo(input, init);
            if (response.ok && isPushEventRequest(url, method)) schedulePushFlush(flush);
        } catch { /* nunca afecta a la petición */ }
        return response;
    };
}
