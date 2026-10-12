/**
 * useHarvestStore — Slim Orchestrator
 *
 * Refactored architecture:
 *   useHarvestStore.ts   — Pure composition (~70 lines)
 *   safeStorage.ts       — localStorage with quota handling
 *   storeSync.ts         — Hydration, delta sync, realtime subscriptions
 *   storeTypes.ts        — Shared type definitions
 *   slices/              — 7 domain slices (settings, crew, bucket, intelligence, row, orchardMap, ui)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';

// Domain modules
import { safeStorage } from './safeStorage';
import {
  hydrateFromRecovery,
  hydrateFromDexie,
  fetchOrchardData,
  setupRealtimeSubscriptions,
} from './storeSync';

// Slice imports
import { createSettingsSlice } from './slices/settingsSlice';
import { createCrewSlice } from './slices/crewSlice';
import { createBucketSlice } from './slices/bucketSlice';
import { createIntelligenceSlice } from './slices/intelligenceSlice';
import { createRowSlice } from './slices/rowSlice';
import { createOrchardMapSlice } from './slices/orchardMapSlice';
import { createUISlice } from './slices/uiSlice';

// Re-export types for backward compatibility
export type { HarvestStoreState, ScannedBucket, HarvestStats } from './storeTypes';
import type { HarvestStoreState } from './storeTypes';

// Module-level ref for visibility cleanup
let _visibilityHandler: (() => void) | null = null;
let _onlineHandler: (() => void) | null = null;

export const useHarvestStore = create<HarvestStoreState>()(
  persist(
    (set, get, api) => ({
      // === SLICES ===
      ...createSettingsSlice(set, get, api),
      ...createCrewSlice(set, get, api),
      ...createBucketSlice(set, get, api),
      ...createIntelligenceSlice(set, get, api),
      ...createRowSlice(set, get, api),
      ...createOrchardMapSlice(set, get, api),
      ...createUISlice(set, get, api),

      // === ORCHESTRATOR STATE ===
      currentUser: null,
      inventory: [],
      orchard: null,
      serverTimestamp: null,
      clockSkew: 0,
      simulationMode: false,
      dayClosed: false,
      lastSyncAt: null,
      recentQcInspections: [],
      recentTimesheetUpdates: [],

      // === ORCHESTRATOR ACTIONS ===
      setGlobalState: data => set(data),
      setDayClosed: closed => set({ dayClosed: closed }),
      reset: () => set({ buckets: [], lastScanTime: null }),
      setSimulationMode: enabled => {
        set({ simulationMode: enabled });
        logger.info(`[Store] Simulation mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
      },

      // === FETCH GLOBAL DATA ===
      fetchGlobalData: async (orchardId?: string) => {
        logger.info('[Store] Fetching global data...', orchardId ? `for orchard ${orchardId}` : '');
        hydrateFromRecovery(set);
        await hydrateFromDexie(set);
        try {
          const activeOrchard = await fetchOrchardData(get, set, orchardId);
          get().recalculateIntelligence();
          if (activeOrchard?.id) {
            setupRealtimeSubscriptions(activeOrchard.id, get, set);
            if (_visibilityHandler)
              document.removeEventListener('visibilitychange', _visibilityHandler);
            _visibilityHandler = () => {
              if (document.hidden) {
                logger.info('[Store] Tab hidden — disconnecting realtime');
                supabase.removeAllChannels();
              } else {
                logger.info('[Store] Tab visible — reconnecting realtime');
                setupRealtimeSubscriptions(activeOrchard.id, get, set);
                // Recalcular: los totales por picker salen de las cubetas recién bajadas
                fetchOrchardData(get, set)
                  .then(() => get().recalculateIntelligence())
                  .catch(() => {});
              }
            };
            document.addEventListener('visibilitychange', _visibilityHandler);

            // Vuelve la conexión: lo que llegó mientras no había red (cubetas
            // subidas por otros móviles, fichajes) no entró por tiempo real.
            if (_onlineHandler) window.removeEventListener('online', _onlineHandler);
            _onlineHandler = () => {
              logger.info('[Store] Back online — catching up');
              if (!document.hidden) setupRealtimeSubscriptions(activeOrchard.id, get, set);
              fetchOrchardData(get, set)
                .then(() => get().recalculateIntelligence())
                .catch(() => {});
            };
            window.addEventListener('online', _onlineHandler);
          }
        } catch (error) {
          logger.error('[Store] Error fetching global data:', error);
        }
      },
    }),
    {
      name: 'harvest-pro-storage',
      storage: createJSONStorage(() => safeStorage),
      partialize: state => ({
        settings: state.settings,
        orchard: state.orchard,
        crew: state.crew,
        currentUser: state.currentUser,
        simulationMode: state.simulationMode,
        clockSkew: state.clockSkew,
        lastSyncAt: state.lastSyncAt,
        rowAssignments: state.rowAssignments,
      }),
    }
  )
);
