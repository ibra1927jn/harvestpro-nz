/**
 * settings.service — tests del mapping + error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/repositories/settings.repository', () => ({
    settingsRepository: {
        getByOrchardId: vi.fn(),
        upsert: vi.fn(),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { settingsService } from './settings.service';
import { settingsRepository } from '@/repositories/settings.repository';
import { logger } from '@/utils/logger';

describe('settingsService.getHarvestSettings', () => {
    beforeEach(() => vi.clearAllMocks());

    it('devuelve null cuando repo devuelve null', async () => {
        (settingsRepository.getByOrchardId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        expect(await settingsService.getHarvestSettings('o1')).toBeNull();
    });

    it('mapea campos del DTO DB a HarvestSettings', async () => {
        (settingsRepository.getByOrchardId as ReturnType<typeof vi.fn>).mockResolvedValue({
            min_wage_rate: 23.95,
            piece_rate: 6.5,
            min_buckets_per_hour: 8,
            target_tons: 500,
            variety: 'Hayward',
            _ignored_extra: 'foo',
        });
        const result = await settingsService.getHarvestSettings('o1');
        expect(result).toEqual({
            min_wage_rate: 23.95,
            piece_rate: 6.5,
            min_buckets_per_hour: 8,
            target_tons: 500,
            variety: 'Hayward',
        });
    });

    it('no propaga campos extra del row DB', async () => {
        (settingsRepository.getByOrchardId as ReturnType<typeof vi.fn>).mockResolvedValue({
            min_wage_rate: 23.95,
            piece_rate: 6.5,
            min_buckets_per_hour: 8,
            target_tons: 500,
            variety: 'Hayward',
            shift_start_time: '07:00',
        });
        const result = await settingsService.getHarvestSettings('o1');
        expect(result).not.toHaveProperty('shift_start_time');
    });
});

describe('settingsService.updateHarvestSettings', () => {
    beforeEach(() => vi.clearAllMocks());

    it('devuelve true en upsert OK', async () => {
        (settingsRepository.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        const ok = await settingsService.updateHarvestSettings('o1', { min_wage_rate: 24 });
        expect(ok).toEqual({ ok: true });
        expect(settingsRepository.upsert).toHaveBeenCalledWith('o1', { min_wage_rate: 24 });
    });

    it('devuelve false y loguea error cuando upsert tira', async () => {
        (settingsRepository.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('db down'),
        );
        const ok = await settingsService.updateHarvestSettings('o1', { variety: 'Gold' });
        expect(ok).toMatchObject({ ok: false });
        expect(logger.error).toHaveBeenCalled();
    });
});
