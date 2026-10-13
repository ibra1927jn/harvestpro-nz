/**
 * Gateway Resilience Service — Retry, timeout, and graceful degradation
 *
 * Provides a resilient wrapper for Supabase Edge Function calls with:
 * - Automatic retry with exponential backoff for 502/504/timeout errors
 * - Configurable timeout per operation
 * - Centralized error classification
 * - Event emitter for UI toast notifications
 */
import { logger } from '@/utils/logger';
import { classifyGatewayError, type GatewayError } from './gateway/classifyGatewayError';

// ── Types ────────────────────────────────────────────

export interface GatewayOptions {
    /** Max retry attempts (default: 3) */
    maxRetries?: number;
    /** Request timeout in ms (default: 15000) */
    timeoutMs?: number;
    /** Base delay for exponential backoff in ms (default: 1000) */
    baseDelayMs?: number;
    /** Human-readable operation name for error messages */
    operationName?: string;
}

// Tipos y clasificación en gateway/classifyGatewayError.ts (reexportados por compatibilidad)
export type { GatewayErrorType, GatewayError } from './gateway/classifyGatewayError';

// ── Event System for UI Notifications ────────────────

type GatewayEventType = 'degraded' | 'recovered' | 'error';
type GatewayListener = (event: { type: GatewayEventType; message: string; error?: GatewayError }) => void;

const listeners = new Set<GatewayListener>();
let degradedSince: number | null = null;

// ── Default Config ───────────────────────────────────

const DEFAULTS: Required<GatewayOptions> = {
    maxRetries: 3,
    timeoutMs: 15_000,
    baseDelayMs: 1_000,
    operationName: 'Edge Function',
};

// ── Core Service ─────────────────────────────────────

export const gatewayService = {

    /**
     * Subscribe to gateway status events (for UI toast integration).
     * Returns unsubscribe function.
     */
    onEvent(listener: GatewayListener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    /**
     * Execute an async operation with retry, timeout, and error classification.
     *
     * @example
     * const result = await gatewayService.withResilience(
     *   () => supabase.functions.invoke('calculate-payroll', { body }),
     *   { operationName: 'Calculate Payroll', maxRetries: 2 }
     * );
     */
    async withResilience<T>(
        operation: (signal: AbortSignal) => Promise<T>,
        options?: GatewayOptions
    ): Promise<T> {
        const config = { ...DEFAULTS, ...options };
        let lastError: GatewayError | null = null;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                const result = await this._executeWithTimeout(operation, config.timeoutMs);

                // If we were degraded and now recovered, notify UI
                if (degradedSince) {
                    const degradedMs = Date.now() - degradedSince;
                    degradedSince = null;
                    this._emit('recovered', `Conexión restaurada (${Math.round(degradedMs / 1000)}s)`);
                }

                return result;
            } catch (error) {
                lastError = this.classifyError(error);

                // Don't retry non-retryable errors
                if (!lastError.retryable) {
                    logger.error(`[Gateway] ${config.operationName} failed (non-retryable): ${lastError.message}`);
                    throw this._toError(lastError);
                }

                // Last attempt — don't wait, just throw
                if (attempt === config.maxRetries) {
                    logger.error(`[Gateway] ${config.operationName} failed after ${attempt + 1} attempts: ${lastError.message}`);
                    break;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = config.baseDelayMs * Math.pow(2, attempt);
                logger.warn(`[Gateway] ${config.operationName} attempt ${attempt + 1} failed (${lastError.type}). Retrying in ${delay}ms...`);

                // Notify UI on first degradation
                if (!degradedSince) {
                    degradedSince = Date.now();
                    this._emit('degraded', 'Conexión inestable. Reintentando...');
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // All retries exhausted
        this._emit('error', `${config.operationName} falló tras ${config.maxRetries + 1} intentos`);
        throw this._toError(lastError!);
    },

    /**
     * Classify any error into a GatewayError with type and retryability.
     */
    classifyError(error: unknown): GatewayError {
        const online = typeof navigator === 'undefined' || navigator.onLine;
        return classifyGatewayError(error, online);
    },

    /** @internal Execute with AbortController timeout */
    async _executeWithTimeout<T>(
        operation: (signal: AbortSignal) => Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await operation(controller.signal);
        } finally {
            clearTimeout(timer);
        }
    },

    /** @internal Emit event to all listeners */
    _emit(type: GatewayEventType, message: string, error?: GatewayError) {
        listeners.forEach(listener => {
            try {
                listener({ type, message, error });
            } catch (err) {
                logger.warn('[Gateway] Listener error suppressed:', err);
            }
        });
    },

    /** @internal Convert GatewayError to standard Error */
    _toError(gwError: GatewayError): Error {
        const err = new Error(gwError.message);
        err.name = `GatewayError:${gwError.type}`;
        return err;
    },

    /** @internal Reset internal state (for testing only) */
    _resetState() {
        degradedSince = null;
        listeners.clear();
    },
};
