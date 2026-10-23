/**
 * Store Types — Shared type definitions for all Zustand slices
 * 
 * This file exists to prevent circular imports between slices and the orchestrator.
 * All slice interfaces are defined here and composed into the full HarvestStoreState.
 */
import { ComplianceViolation } from '@/services/compliance.service';
import {
    Picker,
    Bin,
    HarvestSettings,
    BucketRecord,
    Notification,
    RowAssignment,
    OrchardBlock
} from '@/types';
import type { OrchardMapSlice } from './slices/orchardMapSlice';
import type { UISlice } from './slices/uiSlice';

// --- Local Types (used by store but not exported from @/types) ---
export interface ScannedBucket {
    id: string;
    picker_id: string;
    quality_grade: 'A' | 'B' | 'C' | 'reject';
    timestamp: string;
    synced: boolean;
    orchard_id: string;
    /** Fila del picker al escanear (para cobrar al precio de su variedad) */
    row_number?: number;
    bin_id?: string | null;
    /** Rechazado por el servidor: no se reintenta (motivo en failure_reason) */
    failed?: boolean;
    failure_reason?: string;
    /** Corrección (ms) ya sumada a timestamp por el desfase del reloj del móvil */
    clock_skew_ms?: number;
}

export interface HarvestStats {
    totalBuckets: number;
    payEstimate: number;
    tons: number;
    velocity: number;
    goalVelocity: number;
    binsFull: number;
}

// --- Slice Interfaces ---

export interface SettingsSlice {
    settings: HarvestSettings;
    updateSettings: (newSettings: Partial<HarvestSettings>) => Promise<void>;
}

export interface CrewSlice {
    crew: Picker[];
    presentCount: number;
    addPicker: (picker: Partial<Picker>) => Promise<void>;
    removePicker: (id: string) => Promise<void>;
    updatePicker: (id: string, updates: Partial<Picker>) => Promise<void>;
    unassignUser: (id: string) => Promise<void>;
}

export interface BucketSlice {
    buckets: ScannedBucket[];
    isScanning: boolean;
    lastScanTime: number | null;
    bucketRecords: BucketRecord[];
    /**
     * Guarda un escaneo. La promesa se resuelve cuando ya está en IndexedDB
     * (true) o si no se guardó (false): solo entonces se puede decir "Saved".
     */
    addBucket: (bucket: Omit<ScannedBucket, 'id' | 'synced' | 'failed' | 'failure_reason' | 'clock_skew_ms'>) => Promise<boolean>;
    markAsSynced: (id: string) => void;
    markAsFailed: (id: string, reason: string) => void;
    clearSynced: () => void;
}

export interface IntelligenceSlice {
    alerts: ComplianceViolation[];
    payroll: {
        totalPiece: number;
        totalMinimum: number;
        finalTotal: number;
    };
    notifications: Notification[];
    stats: HarvestStats;
    recalculateIntelligence: () => void;
}

export interface RowSlice {
    rowAssignments: RowAssignment[];
    assignRow: (rowNumber: number, side: 'north' | 'south', pickerIds: string[]) => Promise<void>;
    assignRows: (rowNumbers: number[], side: 'north' | 'south', pickerIds: string[]) => Promise<void>;
    updateRowProgress: (rowId: string, percentage: number) => Promise<void>;
    completeRow: (rowId: string) => Promise<void>;
}

// Orchestrator-only state (not in any slice)
export interface OrchestratorSlice {
    currentUser: { name: string; role: string | null; id?: string } | null;
    inventory: Bin[];
    orchard: { id: string; name?: string; total_rows?: number } | null;
    serverTimestamp: number | null;
    clockSkew: number;
    simulationMode: boolean;
    dayClosed: boolean;
    /** ISO timestamp of last successful data sync from Supabase */
    lastSyncAt: string | null;
    // 🔧 U9: Changed from scalar to list to prevent event squashing
    recentQcInspections: Record<string, unknown>[];
    recentTimesheetUpdates: Record<string, unknown>[];
    /** Hora (ms) del último cambio de daily_attendance llegado en vivo; 0 = ninguno */
    attendanceChangedAt: number;
    // Orchestrator actions
    setGlobalState: (data: Partial<HarvestStoreState>) => void;
    fetchGlobalData: () => Promise<void>;
    setSimulationMode: (enabled: boolean) => void;
    setDayClosed: (closed: boolean) => void;
    reset: () => void;
}

// --- Full Store Type (Intersection of all slices) ---
export type HarvestStoreState = SettingsSlice
    & CrewSlice
    & BucketSlice
    & IntelligenceSlice
    & RowSlice
    & OrchardMapSlice
    & UISlice
    & OrchestratorSlice;

// Re-export for convenience
export type { OrchardMapSlice, OrchardBlock, UISlice };
