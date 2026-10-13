/**
 * bucketSlice - Bucket Scanning & Offline Sync
 * 
 * Manages local bucket state (offline-first), marking as synced,
 * and the bucket scan pipeline.
 */
import { StateCreator } from 'zustand';
// supabase import removed — direct inserts eliminated, Dexie is sole sync path
import { offlineService } from '@/services/offline.service';
import { auditService } from '@/services/audit.service';
import { analytics } from '@/config/analytics';
import { logger } from '@/utils/logger';
import type { HarvestStoreState, BucketSlice, ScannedBucket } from '../storeTypes';

// Max allowed clock skew for anti-fraud (5 minutes)
const MAX_ALLOWED_SKEW = 5 * 60 * 1000;

// --- Slice Creator ---
export const createBucketSlice: StateCreator<
    HarvestStoreState,
    [],
    [],
    BucketSlice
> = (set, get) => ({
    buckets: [],
    isScanning: false,
    lastScanTime: null,
    bucketRecords: [],

    addBucket: async (bucketData) => {
        // 🔴 VALIDATION: Reject if picker is archived
        const picker = get().crew.find(p => p.id === bucketData.picker_id);
        if (picker?.status === 'archived') {
            logger.error(`[Store] Rejected bucket: picker ${bucketData.picker_id} is archived`);
            return false;
        }

        // ⚠️ SOFT WARNING: Picker may not be checked in (offline cross-device sync issue)
        // In offline scenarios, Team Leader's check-in may not have synced to Runner's device.
        // We allow the bucket but flag it for reconciliation.
        if (picker && !picker.checked_in_today) {
            logger.warn(`[Store] Bucket for picker ${bucketData.picker_id} who is NOT checked in — allowing with warning`);
        }

        // 🔴 VALIDATION: Reject if clock skew > 5 minutes (anti-fraud)
        const clockSkew = get().clockSkew;
        if (Math.abs(clockSkew) > MAX_ALLOWED_SKEW) {
            logger.error(`[Store] Rejected bucket: clock skew ${clockSkew}ms exceeds ${MAX_ALLOWED_SKEW}ms`);
            return false;
        }

        const newBucket: ScannedBucket = {
            ...bucketData,
            id: crypto.randomUUID(),
            synced: false,
        };

        // Instant local update
        set(state => ({
            buckets: [newBucket, ...state.buckets],
            lastScanTime: Date.now(),
        }));

        // 🔍 Audit log the scan
        auditService.logAudit(
            'bucket.scanned',
            `Bucket scanned for picker ${bucketData.picker_id}`,
            {
                severity: 'info',
                userId: get().currentUser?.id,
                orchardId: bucketData.orchard_id,
                entityType: 'bucket',
                entityId: newBucket.id,
                details: {
                    quality_grade: bucketData.quality_grade,
                    picker_id: bucketData.picker_id,
                }
            }
        );

        // 📊 PostHog: Track bucket scan event
        analytics.trackBucketScanned(bucketData.picker_id, bucketData.quality_grade);

        // Recalculate intelligence after adding bucket
        get().recalculateIntelligence();

        // 📦 Persist to Dexie — SINGLE SOURCE OF TRUTH for offline sync
        // 🔧 V17: Include scanned_by to preserve authorship for offline audit trail
        // Se ESPERA a que el registro esté en IndexedDB: quien llama solo dice
        // "Saved" después. Antes el aviso salía antes de la escritura (cifrar el
        // primer escaneo tras abrir la app tarda: derivar la clave) y cerrar la
        // app en ese momento perdía la cubeta.
        try {
            await offlineService.queueBucket({
                id: newBucket.id,
                picker_id: newBucket.picker_id,
                quality_grade: newBucket.quality_grade,
                timestamp: newBucket.timestamp,
                orchard_id: newBucket.orchard_id,
                scanned_by: get().currentUser?.id || 'unknown',
                ...(newBucket.row_number ? { row_number: newBucket.row_number } : {}),
                ...(newBucket.bin_id ? { bin_id: newBucket.bin_id } : {}),
            });
            return true;
        } catch (e) {
            // No quedó en el móvil: se quita (si no, se subiría desde memoria y
            // al escanear de nuevo habría dos) y quien llama avisa "no guardado"
            logger.error('Failed to save to Dexie:', e);
            // Si mientras tanto ya se subió (servidor rápido), está a salvo
            if (get().buckets.some(b => b.id === newBucket.id && b.synced)) return true;
            set(state => ({ buckets: state.buckets.filter(b => b.id !== newBucket.id) }));
            get().recalculateIntelligence();
            return false;
        }
    },

    markAsSynced: (id) => {
        set(state => ({
            buckets: state.buckets.map(b =>
                b.id === id ? { ...b, synced: true } : b
            )
        }));
        // Also mark in Dexie
        offlineService.markAsSynced(id)
            .catch(e => logger.error('Failed to mark synced in Dexie:', e));
    },

    markAsFailed: (id, reason) => {
        set(state => ({
            buckets: state.buckets.map(b =>
                b.id === id ? { ...b, failed: true, failure_reason: reason } : b
            )
        }));
        offlineService.markAsFailed(id, reason)
            .catch(e => logger.error('Failed to mark failed in Dexie:', e));
    },

    clearSynced: () => {
        set(state => ({
            buckets: state.buckets.filter(b => !b.synced)
        }));
    },
});
