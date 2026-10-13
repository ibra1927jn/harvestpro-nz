/**
 * Clasificación de errores del gateway (pura): tipo, estado HTTP y si se reintenta.
 * Extraída de gateway.service.ts; el orden de las reglas importa (la primera gana).
 * @module services/gateway/classifyGatewayError
 */
export type GatewayErrorType = 'timeout' | 'server' | 'network' | 'auth' | 'validation' | 'unknown';

export interface GatewayError {
    type: GatewayErrorType;
    message: string;
    status?: number;
    retryable: boolean;
    originalError?: unknown;
}

interface MessageRule {
    type: GatewayErrorType;
    retryable: boolean;
    /** Fragmentos (en minúsculas) que activan la regla */
    needles: readonly string[];
    /** Estado HTTP deducido del mensaje */
    status?: (msg: string) => number;
    /** Mensaje fijo para el usuario (si no, el del error original) */
    message?: string;
}

const MESSAGE_RULES: readonly MessageRule[] = [
    {
        type: 'server', retryable: true,
        needles: ['504', '502', '503', 'gateway'],
        status: m => (m.includes('504') ? 504 : m.includes('502') ? 502 : 503),
    },
    {
        type: 'server', retryable: true,
        needles: ['429', 'rate limit'],
        status: () => 429, message: 'Límite de solicitudes excedido',
    },
    {
        type: 'network', retryable: true,
        needles: ['fetch', 'network', 'timeout', 'aborted', 'econnrefused', 'dns'],
    },
    {
        type: 'auth', retryable: false,
        needles: ['401', '403', 'unauthorized', 'forbidden'],
        status: m => (m.includes('403') ? 403 : 401),
    },
    {
        type: 'validation', retryable: false,
        needles: ['400', '422', 'constraint', 'violat', 'invalid'],
        status: () => 400,
    },
];

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function classifyByMessage(error: Error): GatewayError | null {
    const msg = error.message.toLowerCase();
    const rule = MESSAGE_RULES.find(r => r.needles.some(n => msg.includes(n)));
    if (!rule) return null;
    const result: GatewayError = {
        type: rule.type,
        message: rule.message ?? error.message,
        retryable: rule.retryable,
        originalError: error,
    };
    if (rule.status) result.status = rule.status(msg);
    return result;
}

/** Clasifica cualquier error. `online` = navigator.onLine (sin red todo es reintentable) */
export function classifyGatewayError(error: unknown, online: boolean): GatewayError {
    // Timeout del AbortController
    if (error instanceof DOMException && error.name === 'AbortError') {
        return { type: 'timeout', message: 'Request timed out', retryable: true };
    }
    if (!online) {
        return { type: 'network', message: 'Sin conexión a internet', retryable: true, originalError: error };
    }
    if (error instanceof Error) {
        const byMessage = classifyByMessage(error);
        if (byMessage) return byMessage;
    }
    // FunctionsHttpError de Supabase con status
    if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = (error as { status: number }).status;
        if (RETRYABLE_STATUSES.has(status)) {
            return { type: 'server', message: `Server error (${status})`, status, retryable: true, originalError: error };
        }
    }
    return {
        type: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        originalError: error,
    };
}
