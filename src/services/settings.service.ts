import { logger } from '@/utils/logger';
import { settingsRepository } from '@/repositories/settings.repository';
import { HarvestSettings } from '../types';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

export const settingsService = {
    // --- SETTINGS ---
    async getHarvestSettings(orchardId: string): Promise<HarvestSettings | null> {
        const data = await settingsRepository.getByOrchardId(orchardId);
        if (!data) return null;

        return {
            min_wage_rate: data.min_wage_rate,
            piece_rate: data.piece_rate,
            min_buckets_per_hour: data.min_buckets_per_hour,
            target_tons: data.target_tons,
            variety: data.variety,
        };
    },

    async updateHarvestSettings(
        orchardId: string,
        updates: Partial<HarvestSettings>
    ): Promise<{ ok: true } | { ok: false; reason: string }> {
        try {
            await settingsRepository.upsert(orchardId, updates);
            return { ok: true };
        } catch (error) {
            const msg = (error as { message?: string })?.message ?? String(error);
            logger.error('[SettingsService] Failed to update settings:', msg);
            // Motivo legible para la pantalla
            const reason = /min_wage_floor/i.test(msg)
                ? `Minimum wage cannot be below the NZ legal minimum ($${PAY_RULES.minWageFloor}/h).`
                : /fetch|network/i.test(msg)
                    ? 'No connection — settings not saved.'
                    : 'Settings not saved. Please try again.';
            return { ok: false, reason };
        }
    },
};
