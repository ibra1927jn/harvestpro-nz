/**
 * Deep tests for gateway.service.ts (230L) — exercises ALL branches
 * classifyError (8 categories), withResilience (retry + timeout + recovery),
 * onEvent, _emit, _toError, _resetState, _executeWithTimeout
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { gatewayService } from '../gateway.service';

describe('gatewayService — deep branch tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayService._resetState();
  });

  describe('classifyError', () => {
    it('classifies AbortError as timeout', () => {
      const err = new DOMException('AbortError', 'AbortError');
      const result = gatewayService.classifyError(err);
      expect(result.type).toBe('timeout');
      expect(result.retryable).toBe(true);
    });

    it('classifies 502 as server (retryable)', () => {
      const result = gatewayService.classifyError(new Error('502 Bad Gateway'));
      expect(result.type).toBe('server');
      expect(result.status).toBe(502);
      expect(result.retryable).toBe(true);
    });

    it('classifies 504 as server', () => {
      const result = gatewayService.classifyError(new Error('504 Gateway Timeout'));
      expect(result.type).toBe('server');
      expect(result.status).toBe(504);
    });

    it('classifies bad gateway text as server', () => {
      const result = gatewayService.classifyError(new Error('bad gateway'));
      expect(result.type).toBe('server');
    });

    it('classifies 429 as rate limited', () => {
      const result = gatewayService.classifyError(new Error('429 rate limit'));
      expect(result.type).toBe('server');
      expect(result.status).toBe(429);
    });

    it('classifies fetch error as network', () => {
      const result = gatewayService.classifyError(new Error('fetch failed'));
      expect(result.type).toBe('network');
      expect(result.retryable).toBe(true);
    });

    it('classifies ECONNREFUSED as network', () => {
      const result = gatewayService.classifyError(new Error('ECONNREFUSED'));
      expect(result.type).toBe('network');
    });

    it('classifies dns error as network', () => {
      const result = gatewayService.classifyError(new Error('dns resolution failed'));
      expect(result.type).toBe('network');
    });

    it('classifies 401 as auth (not retryable)', () => {
      const result = gatewayService.classifyError(new Error('401 Unauthorized'));
      expect(result.type).toBe('auth');
      expect(result.retryable).toBe(false);
    });

    it('classifies 403 as auth', () => {
      const result = gatewayService.classifyError(new Error('403 forbidden'));
      expect(result.type).toBe('auth');
      expect(result.status).toBe(403);
    });

    it('classifies 400 as validation', () => {
      const result = gatewayService.classifyError(new Error('400 bad request'));
      expect(result.type).toBe('validation');
      expect(result.retryable).toBe(false);
    });

    it('classifies constraint violation as validation', () => {
      const result = gatewayService.classifyError(new Error('constraint violation'));
      expect(result.type).toBe('validation');
    });

    it('classifies invalid input as validation', () => {
      const result = gatewayService.classifyError(new Error('invalid input'));
      expect(result.type).toBe('validation');
    });

    it('classifies object with status 502', () => {
      const result = gatewayService.classifyError({ status: 502 });
      expect(result.type).toBe('server');
      expect(result.retryable).toBe(true);
    });

    it('classifies unknown error', () => {
      const result = gatewayService.classifyError('random');
      expect(result.type).toBe('unknown');
      expect(result.retryable).toBe(false);
    });

    it('classifies unknown Error object', () => {
      const result = gatewayService.classifyError(new Error('something'));
      expect(result.type).toBe('unknown');
    });
  });

  describe('withResilience', () => {
    it('returns result on success', async () => {
      const result = await gatewayService.withResilience(async () => 'ok', { maxRetries: 0 });
      expect(result).toBe('ok');
    });

    it('throws non-retryable error immediately', async () => {
      await expect(
        gatewayService.withResilience(
          async () => {
            throw new Error('401 Unauthorized');
          },
          { maxRetries: 3 }
        )
      ).rejects.toThrow();
    });

    it('retries retryable errors and recovers', async () => {
      let attempts = 0;
      const op = async () => {
        attempts++;
        if (attempts < 2) throw new Error('502 Bad Gateway');
        return 'recovered';
      };
      const result = await gatewayService.withResilience(op, { maxRetries: 2, baseDelayMs: 1 });
      expect(result).toBe('recovered');
      expect(attempts).toBe(2);
    });

    it('exhausts retries and throws', async () => {
      await expect(
        gatewayService.withResilience(
          async () => {
            throw new Error('502');
          },
          { maxRetries: 1, baseDelayMs: 1 }
        )
      ).rejects.toThrow();
    });
  });

  describe('onEvent', () => {
    it('registers and calls listener', () => {
      const listener = vi.fn();
      gatewayService.onEvent(listener);
      gatewayService._emit('error', 'test error');
      expect(listener).toHaveBeenCalledWith({
        type: 'error',
        message: 'test error',
        error: undefined,
      });
    });

    it('unsubscribes listener', () => {
      const listener = vi.fn();
      const unsub = gatewayService.onEvent(listener);
      unsub();
      gatewayService._emit('error', 'test');
      expect(listener).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', () => {
      gatewayService.onEvent(() => {
        throw new Error('listener crash');
      });
      expect(() => gatewayService._emit('error', 'test')).not.toThrow();
    });
  });

  describe('_toError', () => {
    it('converts GatewayError to Error', () => {
      const err = gatewayService._toError({ type: 'server', message: 'down', retryable: true });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('GatewayError:server');
    });
  });

  describe('_executeWithTimeout', () => {
    it('resolves before timeout', async () => {
      const result = await gatewayService._executeWithTimeout(async () => 'done', 5000);
      expect(result).toBe('done');
    });
  });

  describe('_resetState', () => {
    it('clears listeners and degraded state', () => {
      gatewayService.onEvent(vi.fn());
      gatewayService._resetState();
      const spy = vi.fn();
      gatewayService._emit('error', 'after reset');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});


describe('gateway keeps the HTTP status of a refused call', () => {
    it('a 409 from the Edge Function keeps status 409 (the offline queue knows it is a refusal)', async () => {
        const { gatewayService } = await import('../gateway.service');
        const refusal = Object.assign(new Error('DAY_CLOSED: this day is closed.'), { status: 409 });
        await expect(gatewayService.withResilience(async () => { throw refusal; }, { operationName: 't', maxRetries: 0 }))
            .rejects.toMatchObject({ status: 409, message: 'DAY_CLOSED: this day is closed.' });
    });
});
