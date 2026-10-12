import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsService } from '../settings.service';

// ── Mocks ──────────────────────────────────
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock the repository, not supabase directly
vi.mock('@/repositories/settings.repository', () => ({
    settingsRepository: {
        getByOrchardId: vi.fn(),
        upsert: vi.fn(),
    },
}));

import { settingsRepository } from '@/repositories/settings.repository';

const mockGetByOrchardId = settingsRepository.getByOrchardId as ReturnType<typeof vi.fn>;
const mockUpsert = settingsRepository.upsert as ReturnType<typeof vi.fn>;

describe('settingsService', () => {
    beforeEach(() => vi.clearAllMocks());

    // ═══════════════════════════════════════
    // getHarvestSettings
    // ═══════════════════════════════════════

    it('getHarvestSettings returns mapped settings on success', async () => {
        const dbRow = {
            min_wage_rate: 23.95,
            piece_rate: 5.0,
            min_buckets_per_hour: 3,
            target_tons: 100,
            variety: 'Hayward',
        };
        mockGetByOrchardId.mockResolvedValue(dbRow);

        const result = await settingsService.getHarvestSettings('orchard-1');

        expect(result).toEqual({
            min_wage_rate: 23.95,
            piece_rate: 5.0,
            min_buckets_per_hour: 3,
            target_tons: 100,
            variety: 'Hayward',
        });
        expect(mockGetByOrchardId).toHaveBeenCalledWith('orchard-1');
    });

    it('getHarvestSettings returns null on error', async () => {
        mockGetByOrchardId.mockResolvedValue(null);

        const result = await settingsService.getHarvestSettings('bad-id');
        expect(result).toBeNull();
    });

    // ═══════════════════════════════════════
    // updateHarvestSettings
    // ═══════════════════════════════════════

    it('updateHarvestSettings returns true and calls repository upsert', async () => {
        mockUpsert.mockResolvedValue(undefined);

        const updates = { piece_rate: 6.0, variety: 'Gold3' };
        const result = await settingsService.updateHarvestSettings('orchard-1', updates);

        expect(result).toEqual({ ok: true });
        expect(mockUpsert).toHaveBeenCalledWith('orchard-1', updates);
    });

    it('updateHarvestSettings returns false on error', async () => {
        mockUpsert.mockRejectedValue(new Error('Permission denied'));

        const result = await settingsService.updateHarvestSettings('orchard-1', {});
        expect(result).toMatchObject({ ok: false });
    });

    it('updateHarvestSettings does NOT include updated_at in payload (R9-Fix3)', async () => {
        mockUpsert.mockResolvedValue(undefined);

        await settingsService.updateHarvestSettings('o1', { piece_rate: 7 });

        const [, updates] = mockUpsert.mock.calls[0];
        expect(updates).not.toHaveProperty('updated_at');
    });
});

