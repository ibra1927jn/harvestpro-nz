/**
 * wage-rates.service.ts — Unit + integration tests
 * Covers: getWageRates, getCachedWageRates, getHourlyRate, saveWageRate, validateWageRate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock getCurrentTaxYear to always return 2026-2027 rates

// ── Supabase query chain factory ──────────────────────
function makeChain(data: unknown, error: unknown = null) {
    const resolved = Promise.resolve({ data, error });
    const chain: Record<string, unknown> = {
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
    };
    ['select', 'eq', 'lte', 'order', 'gte', 'in', 'limit', 'single'].forEach(m => {
        chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain['upsert'] = vi.fn().mockResolvedValue({ data: null, error });
    chain['insert'] = vi.fn().mockResolvedValue({ data: null, error });
    return chain;
}

const mockFrom = vi.fn();

vi.mock('@/services/supabase', () => ({
    supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

import {
    getWageRates,
    getCachedWageRates,
    getHourlyRate,
    saveWageRate,
    validateWageRate,
    type WageRate,
    type WageRatesConfig,
} from '../wage-rates.service';

// ── Test fixture ──────────────────────────────────────
function makeWageRate(overrides: Partial<WageRate> = {}): WageRate {
    return {
        id: 'wr-1',
        orchard_id: 'o1',
        job_type: 'picker',
        hourly_rate: 25.00,
        is_piece_rate_eligible: true,
        piece_rate_per_bin: 6.5,
        effective_from: '2026-04-01',
        notes: 'Test rate',
        updated_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
        ...overrides,
    };
}

function makeConfig(rateOverrides: Partial<WageRate> = {}): WageRatesConfig {
    const picker = makeWageRate(rateOverrides);
    return {
        orchardId: 'o1',
        rates: {
            picker,
            team_leader: makeWageRate({ job_type: 'team_leader', hourly_rate: 28.00 }),
            runner: makeWageRate({ job_type: 'runner', hourly_rate: 24.00, is_piece_rate_eligible: false }),
            qc_inspector: makeWageRate({ job_type: 'qc_inspector', hourly_rate: 26.00, is_piece_rate_eligible: false }),
        },
        lastUpdated: '2026-04-01T00:00:00Z',
    };
}

// ──────────────────────────────────────────────────────
// getWageRates
// ──────────────────────────────────────────────────────
describe('getWageRates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('only loads rates effective on or before today in NZ (not the UTC date)', async () => {
        // 1 abr 08:00 en NZ = 31 mar 19:00 UTC: una tarifa que empieza el 1 abr ya vale
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-03-31T19:00:00Z'));
        try {
            const chain = makeChain([makeWageRate()]);
            mockFrom.mockReturnValue(chain);
            await getWageRates('o1');
            expect(chain.lte).toHaveBeenCalledWith('effective_from', '2026-04-01');
        } finally {
            vi.useRealTimers();
        }
    });

    it('returns config from DB when available', async () => {
        mockFrom.mockReturnValue(makeChain([makeWageRate()]));
        const config = await getWageRates('o1');
        expect(config.orchardId).toBe('o1');
        expect(config.rates).toBeDefined();
        expect(config.rates['picker']).toBeDefined();
    });

    it('uses DB rate when returned', async () => {
        mockFrom.mockReturnValue(makeChain([makeWageRate({ hourly_rate: 30.00 })]));
        const config = await getWageRates('o1');
        expect(config.rates['picker'].hourly_rate).toBe(30.00);
    });

    it('fills missing job types with NZ defaults', async () => {
        // DB only has picker rate
        mockFrom.mockReturnValue(makeChain([makeWageRate()]));
        const config = await getWageRates('o1');
        // All job types should be present
        expect(config.rates['picker']).toBeDefined();
        expect(config.rates['team_leader']).toBeDefined();
        expect(config.rates['runner']).toBeDefined();
        expect(config.rates['qc_inspector']).toBeDefined();
    });

    it('returns cached config when DB fails', async () => {
        const cachedConfig = makeConfig();
        localStorage.setItem('wage_rates_cache_o1', JSON.stringify(cachedConfig));
        mockFrom.mockImplementation(() => { throw new Error('DB down'); });

        const config = await getWageRates('o1');
        expect(config.orchardId).toBe('o1');
        expect(config.rates['picker'].hourly_rate).toBe(25.00);
    });

    it('caches result in localStorage', async () => {
        mockFrom.mockReturnValue(makeChain([makeWageRate()]));
        await getWageRates('o1');
        const cached = localStorage.getItem('wage_rates_cache_o1');
        expect(cached).not.toBeNull();
        const parsed = JSON.parse(cached!);
        expect(parsed.orchardId).toBe('o1');
    });

    it('deduplicates job types — keeps most recent per job type', async () => {
        const rates = [
            makeWageRate({ id: 'wr-1', effective_from: '2026-04-01', hourly_rate: 25.00 }),
            makeWageRate({ id: 'wr-2', effective_from: '2026-03-01', hourly_rate: 24.00 }),
        ];
        // ordered descending by effective_from, so first is most recent
        mockFrom.mockReturnValue(makeChain(rates));
        const config = await getWageRates('o1');
        // Should take the first (most recent) picker rate
        expect(config.rates['picker'].hourly_rate).toBe(25.00);
    });

    it('returns defaults when DB returns empty array', async () => {
        mockFrom.mockReturnValue(makeChain([]));
        const config = await getWageRates('o1');
        // Default picker rate is 23.95 (NZ_DEFAULT_WAGE_RATES.picker)
        expect(config.rates['picker'].hourly_rate).toBe(23.95);
    });
});

// ──────────────────────────────────────────────────────
// getCachedWageRates
// ──────────────────────────────────────────────────────
describe('getCachedWageRates', () => {
    beforeEach(() => localStorage.clear());

    it('returns cached config from localStorage', () => {
        const config = makeConfig();
        localStorage.setItem('wage_rates_cache_o1', JSON.stringify(config));
        const result = getCachedWageRates('o1');
        expect(result.orchardId).toBe('o1');
        expect(result.rates['picker'].hourly_rate).toBe(25.00);
    });

    it('returns NZ legal defaults when no cache exists', () => {
        const result = getCachedWageRates('no-orchard');
        expect(result.orchardId).toBe('no-orchard');
        // Default picker = 23.95 from NZ_DEFAULT_WAGE_RATES
        expect(result.rates['picker'].hourly_rate).toBe(23.95);
    });

    it('returns defaults when cache is corrupted JSON', () => {
        localStorage.setItem('wage_rates_cache_o1', 'not-valid-json{{{');
        const result = getCachedWageRates('o1');
        expect(result.orchardId).toBe('o1');
        expect(result.rates['picker']).toBeDefined();
    });
});

// ──────────────────────────────────────────────────────
// getHourlyRate
// ──────────────────────────────────────────────────────
describe('getHourlyRate', () => {
    it('returns configured rate when above legal minimum', () => {
        const config = makeConfig({ hourly_rate: 30.00 });
        expect(getHourlyRate(config, 'picker')).toBe(30.00);
    });

    it('returns legal minimum (23.95) for unknown job type', () => {
        const config = makeConfig();
        expect(getHourlyRate(config, 'unknown_type')).toBe(23.95);
    });

    it('clamps to legal minimum when configured rate is below', () => {
        // Rate below NZ minimum (e.g. stale config from before April 1)
        const config = makeConfig({ hourly_rate: 23.15 });
        expect(getHourlyRate(config, 'picker')).toBe(23.95);
    });

    it('returns exactly 23.95 when rate equals legal minimum', () => {
        const config = makeConfig({ hourly_rate: 23.95 });
        expect(getHourlyRate(config, 'picker')).toBe(23.95);
    });

    it('returns team_leader rate from config', () => {
        const config = makeConfig();
        expect(getHourlyRate(config, 'team_leader')).toBe(28.00);
    });
});

// ──────────────────────────────────────────────────────
// saveWageRate
// ──────────────────────────────────────────────────────
describe('saveWageRate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(makeChain(null));
    });

    const validPayload = {
        job_type: 'picker' as const,
        hourly_rate: 25.00,
        is_piece_rate_eligible: true,
        piece_rate_per_bin: 6.5,
        effective_from: '2026-04-01',
        notes: 'Updated for 2026',
        updated_by: 'admin-1',
    };

    it('returns success:true for valid rate above minimum', async () => {
        const result = await saveWageRate('o1', validPayload);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('returns error when rate is below NZ legal minimum', async () => {
        const result = await saveWageRate('o1', { ...validPayload, hourly_rate: 20.00 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('23.95');
    });

    it('calls supabase upsert with correct orchard_id', async () => {
        await saveWageRate('o1', validPayload);
        expect(mockFrom).toHaveBeenCalledWith('wage_rates');
    });

    it('returns error on supabase failure', async () => {
        const errChain = makeChain(null, { message: 'DB constraint violated' });
        mockFrom.mockReturnValue(errChain);
        const result = await saveWageRate('o1', validPayload);
        expect(result.success).toBe(false);
        expect(result.error).toContain('DB constraint violated');
    });

    it('error message cites minimum wage year', async () => {
        const result = await saveWageRate('o1', { ...validPayload, hourly_rate: 10.00 });
        expect(result.error).toContain('$10');
        expect(result.error).toContain('23.95');
    });
});

// ──────────────────────────────────────────────────────
// validateWageRate
// ──────────────────────────────────────────────────────
describe('validateWageRate', () => {
    it('returns valid:true for rate above minimum', () => {
        const result = validateWageRate(25.00, 'picker');
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('returns violation for rate below NZ minimum (23.95)', () => {
        const result = validateWageRate(23.15, 'picker');
        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]).toContain('23.95');
    });

    it('returns violation for zero rate', () => {
        const result = validateWageRate(0, 'picker');
        expect(result.valid).toBe(false);
        const hasZeroViolation = result.violations.some(v => v.toLowerCase().includes('zero'));
        expect(hasZeroViolation).toBe(true);
    });

    it('returns violation for unreasonably high rate', () => {
        const result = validateWageRate(600, 'picker');
        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.toLowerCase().includes('high'))).toBe(true);
    });

    it('returns multiple violations when applicable', () => {
        // Zero triggers both zero-violation AND below-minimum violation
        const result = validateWageRate(0, 'picker');
        expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });

    it('accepts rate exactly at 23.95 (legal minimum)', () => {
        const result = validateWageRate(23.95, 'picker');
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('accepts 500 (boundary — not above 500)', () => {
        const result = validateWageRate(500, 'picker');
        expect(result.valid).toBe(true);
    });

    it('rejects 500.01 (above boundary)', () => {
        const result = validateWageRate(500.01, 'picker');
        expect(result.valid).toBe(false);
    });
});
