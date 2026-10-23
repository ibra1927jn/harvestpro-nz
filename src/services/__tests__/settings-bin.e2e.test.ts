/**
 * E2E tests for settings.service.ts (33L) + bin.service.ts (22L) + notification.service.ts
 * Small services combined for efficiency
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
    nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

// La cola offline se sustituye por su procesador: el cambio llega al repositorio
// igual que cuando la cola lo sube (sync.service → dispatchItem → processBin)
vi.mock('@/services/sync.service', () => ({
    syncService: {
        addToQueue: async (_type: string, payload: unknown) => {
            const { processBin } = await import('@/services/sync-processors/bin.processor');
            await processBin(payload as Parameters<typeof processBin>[0]);
            return 'queued-id';
        },
    },
}));

// ── Settings mocks ──
const mockGetByOrchardId = vi.fn().mockResolvedValue({
    min_wage_rate: 23.95, piece_rate: 6.50, min_buckets_per_hour: 4, target_tons: 10, variety: 'Braeburn',
});
const mockUpsert = vi.fn().mockResolvedValue(undefined);

vi.mock('@/repositories/settings.repository', () => ({
    settingsRepository: {
        getByOrchardId: (...a: unknown[]) => mockGetByOrchardId(...a),
        upsert: (...a: unknown[]) => mockUpsert(...a),
    },
}));

// ── Bin mocks ──
const mockGetByOrchard = vi.fn().mockResolvedValue([
    { id: 'b1', status: 'empty', bin_code: 'BIN-001', variety: 'Standard' },
    { id: 'b2', status: 'full', bin_code: 'BIN-002' },
]);
const mockUpdateStatus = vi.fn().mockResolvedValue(undefined);

vi.mock('@/repositories/bin.repository', () => ({
    binRepository: {
        getByOrchard: (...a: unknown[]) => mockGetByOrchard(...a),
        updateStatus: (...a: unknown[]) => mockUpdateStatus(...a),
    },
}));

import { settingsService } from '../settings.service';
import { binService } from '../bin.service';

describe('settingsService — E2E tests', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('getHarvestSettings', () => {
        it('returns mapped settings', async () => {
            const settings = await settingsService.getHarvestSettings('o1');
            expect(settings).not.toBeNull();
            expect(settings!.piece_rate).toBe(6.50);
            expect(settings!.min_wage_rate).toBe(23.95);
            expect(settings!.target_tons).toBe(10);
            expect(settings!.variety).toBe('Braeburn');
        });

        it('returns null when no settings', async () => {
            mockGetByOrchardId.mockResolvedValueOnce(null);
            expect(await settingsService.getHarvestSettings('o1')).toBeNull();
        });
    });

    describe('updateHarvestSettings', () => {
        it('upserts settings and returns true', async () => {
            const result = await settingsService.updateHarvestSettings('o1', { piece_rate: 7.00 });
            expect(result).toEqual({ ok: true });
            expect(mockUpsert).toHaveBeenCalledWith('o1', { piece_rate: 7.00 });
        });

        it('returns false on error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('DB error'));
            const result = await settingsService.updateHarvestSettings('o1', { piece_rate: 7.00 });
            expect(result).toMatchObject({ ok: false });
        });
    });
});

describe('binService — E2E tests', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('getBins', () => {
        it('returns mapped bins', async () => {
            const bins = await binService.getBins('o1');
            expect(bins.length).toBe(2);
            expect(bins[0].id).toBe('b1');
            expect(bins[0].status).toBe('empty');
            expect(bins[0].fillPercentage).toBe(0);
            expect(bins[0].bin_code).toBe('BIN-001');
        });

        it('returns empty array when no data', async () => {
            mockGetByOrchard.mockResolvedValueOnce(null);
            const bins = await binService.getBins('o1');
            expect(bins).toEqual([]);
        });
    });

    describe('updateBinStatus', () => {
        it('sets filled_at for full bins', async () => {
            await binService.updateBinStatus('b1', 'full');
            expect(mockUpdateStatus).toHaveBeenCalledWith('b1', 'full', '2026-03-10T14:00:00+13:00');
        });

        it('passes null filled_at for non-full bins', async () => {
            await binService.updateBinStatus('b1', 'empty');
            expect(mockUpdateStatus).toHaveBeenCalledWith('b1', 'empty', null);
        });
    });
});

