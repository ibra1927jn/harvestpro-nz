/**
 * settingsSlice - Harvest Settings Management
 * 
 * Manages harvest_settings state and persistence via settingsRepository.
 * Most isolated slice — only reads orchard.id and currentUser.id from global state.
 */
import { StateCreator } from 'zustand';
import { settingsRepository } from '@/repositories/settings.repository';
import { auditService } from '@/services/audit.service';
import { logger } from '@/utils/logger';
import { HarvestSettings } from '@/types';
import type { HarvestStoreState, SettingsSlice } from '../storeTypes';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

// --- Default State ---
export const defaultSettings: HarvestSettings = {
    min_wage_rate: PAY_RULES.minWageFloor, // NZ Minimum Wage 2026-2027
    piece_rate: 6.50,
    min_buckets_per_hour: 3.6,
    target_tons: 100,
};

// --- Slice Creator ---
export const createSettingsSlice: StateCreator<
    HarvestStoreState,
    [],
    [],
    SettingsSlice
> = (set, get) => ({
    settings: defaultSettings,

    updateSettings: async (newSettings) => {
        const orchardId = get().orchard?.id;
        if (!orchardId) return;

        // Store previous state for audit + rollback
        const previousSettings = { ...get().settings };

        // Optimistic Update
        set((state) => ({ settings: { ...state.settings, ...newSettings } }));

        try {
            // Update via repository (handles upsert + conflict)
            await settingsRepository.upsert(orchardId, newSettings);

            // 🔍 AUDIT LOG - Legal compliance tracking
            await auditService.logAudit(
                'settings.day_setup_modified',
                'Updated harvest settings',
                {
                    severity: 'info',
                    userId: get().currentUser?.id,
                    orchardId,
                    entityType: 'harvest_settings',
                    entityId: orchardId,
                    details: {
                        previous: previousSettings,
                        updated: newSettings,
                        changes: Object.keys(newSettings)
                    }
                }
            );
            logger.info('✅ [Store] Settings updated via repository');
        } catch (e) {
            logger.error('❌ [Store] Failed to update settings:', e);
            // Rollback
            set({ settings: previousSettings });
        }
    },
});
