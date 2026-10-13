import { describe, it, expect } from 'vitest';
import { classifyGatewayError } from './classifyGatewayError';

const c = (e: unknown, online = true) => classifyGatewayError(e, online);

describe('classifyGatewayError', () => {
    it.each([
        ['504 Gateway Timeout', 'server', 504, true],
        ['HTTP 502', 'server', 502, true],
        ['Service 503', 'server', 503, true],
        ['bad gateway', 'server', 503, true],
        ['429 Too Many', 'server', 429, true],
        ['rate limit hit', 'server', 429, true],
        ['Failed to fetch', 'network', undefined, true],
        ['ECONNREFUSED', 'network', undefined, true],
        ['401 Unauthorized', 'auth', 401, false],
        ['403 forbidden', 'auth', 403, false],
        ['422 unprocessable', 'validation', 400, false],
        ['violates check constraint', 'validation', 400, false],
        ['something odd', 'unknown', undefined, false],
    ] as const)('"%s" → %s (%s, retry=%s)', (msg, type, status, retryable) => {
        const r = c(new Error(msg));
        expect(r.type).toBe(type);
        expect(r.status).toBe(status);
        expect(r.retryable).toBe(retryable);
    });

    it('la primera regla gana: un 502 con "invalid" sigue siendo reintentable', () => {
        expect(c(new Error('502 invalid upstream'))).toMatchObject({ type: 'server', retryable: true });
    });

    it('un timeout de red gana a "invalid" (network antes que validation)', () => {
        expect(c(new Error('timeout: invalid response'))).toMatchObject({ type: 'network' });
    });

    it('rate limit usa mensaje fijo para el usuario', () => {
        expect(c(new Error('429')).message).toBe('Límite de solicitudes excedido');
    });

    it('AbortError es timeout aunque no haya red', () => {
        expect(c(new DOMException('x', 'AbortError'), false)).toMatchObject({ type: 'timeout', retryable: true });
    });

    it('sin red todo es network reintentable, incluso un 401', () => {
        expect(c(new Error('401'), false)).toMatchObject({ type: 'network', retryable: true });
    });

    it('objeto con status reintentable (FunctionsHttpError)', () => {
        expect(c({ status: 504 })).toMatchObject({ type: 'server', status: 504, retryable: true });
        expect(c({ status: 500 })).toMatchObject({ type: 'unknown', retryable: false });
    });

    it('valores no Error se convierten a texto', () => {
        expect(c('boom')).toMatchObject({ type: 'unknown', message: 'boom' });
    });
});
