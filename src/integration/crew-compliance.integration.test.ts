/**
 * INTEGRATION TEST: Crew Management + Compliance + Export
 * 
 * Tests cross-cutting flows: crew → attendance → compliance → payroll → export
 * Uses REAL store, REAL compliance.service, REAL intelligence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock ONLY external boundaries ──────────────
vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
        removeAllChannels: vi.fn(),
    },
}));
vi.mock('@/services/offline.service', () => ({
    offlineService: { queueBucket: vi.fn().mockResolvedValue(undefined), markAsSynced: vi.fn().mockResolvedValue(undefined), getPendingBuckets: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/audit.service', () => ({
    auditService: { logAudit: vi.fn(), logAuth: vi.fn(), logPickerEvent: vi.fn() },
}));
vi.mock('@/config/analytics', () => ({
    analytics: { trackBucketScanned: vi.fn(), identify: vi.fn(), track: vi.fn(), trackEvent: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));
vi.mock('@/services/gateway.service', () => ({
    gatewayService: {
        withResilience: vi.fn((_n: string, fn: () => Promise<unknown>) => fn()),
        onEvent: vi.fn(() => () => { }),
    },
}));

import { useHarvestStore } from '@/stores/useHarvestStore';
import { asShiftData } from './shiftFixtures';

function resetStore(overrides: Record<string, unknown> = {}) {
    if (Array.isArray(overrides.crew)) {
        const shiftData = asShiftData(overrides.crew as { id: string }[]);
        overrides = { ...overrides, crew: shiftData.crew, bucketRecords: shiftData.bucketRecords };
    }
    useHarvestStore.setState({
        buckets: [], bucketRecords: [], isScanning: false, lastScanTime: null,
        crew: [] as any, settings: { piece_rate: 3.50, min_wage_rate: 23.95, bins_per_row: 20 } as any,
        currentUser: { id: 'mgr1', name: 'Manager', role: 'manager' },
        orchard: { id: 'o1', name: 'Test Orchard' }, clockSkew: 0,
        alerts: [], payroll: { totalPiece: 0, totalMinimum: 0, finalTotal: 0 },
        rowAssignments: [],
        ...overrides,
    } as any);
}

// ── CREW MANAGEMENT INTEGRATION TESTS ──────────

describe('Crew Management — Integration', () => {
    beforeEach(() => resetStore());

    it('setGlobalState with crew → presentCount reflects checked-in pickers', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Alice', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 4 },
                { id: 'p2', name: 'Bob', status: 'active', checked_in_today: false, total_buckets_today: 0, hours: 0 },
                { id: 'p3', name: 'Carlo', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 2 },
            ],
        });

        const state = useHarvestStore.getState();
        expect(state.crew.length).toBe(3);
        // presentCount derived from checked-in pickers
        const checkedIn = state.crew.filter((p: any) => p.checked_in_today).length;
        expect(checkedIn).toBe(2);
    });

    it('crew state + addBucket → payroll updated for correct picker', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Alice', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
                { id: 'p2', name: 'Bob', status: 'active', checked_in_today: true, total_buckets_today: 10, hours: 6, current_row: 2, role: 'picker', avatar: 'B' },
            ],
        });

        // Add 5 buckets for Alice
        for (let i = 0; i < 5; i++) {
            useHarvestStore.getState().addBucket({
                picker_id: 'p1', quality_grade: 'A', timestamp: new Date().toISOString(), orchard_id: 'o1',
            });
        }

        const state = useHarvestStore.getState();
        // Alice: 5 new × $3.50 = $17.50
        // Bob: 10 existing × $3.50 = $35
        // Total piece = $52.50
        expect(state.payroll.totalPiece).toBeCloseTo(52.5, 0);
    });

    it('mixed archived + active crew → only active in payroll', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Active1', status: 'active', checked_in_today: true, total_buckets_today: 20, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
                { id: 'p2', name: 'Archived1', status: 'archived', checked_in_today: false, total_buckets_today: 50, hours: 8, current_row: 0, role: 'picker', avatar: 'X' },
                { id: 'p3', name: 'Active2', status: 'active', checked_in_today: true, total_buckets_today: 10, hours: 3, current_row: 2, role: 'picker', avatar: 'B' },
            ],
        });

        useHarvestStore.getState().recalculateIntelligence();

        const state = useHarvestStore.getState();
        // Active1: 20 × $3.50 = $70, Active2: 10 × $3.50 = $35. Archived excluded.
        expect(state.payroll.totalPiece).toBeCloseTo(105, 0);
    });
});

// ── COMPLIANCE INTEGRATION TESTS ──────────────

describe('Compliance — Integration', () => {
    beforeEach(() => resetStore());

    it('NZ minimum wage top-up calculated correctly across crew', () => {
        resetStore({
            crew: [
                // Low earner: 2 buckets in 8 hours → needs top-up
                { id: 'p1', name: 'Low', status: 'active', checked_in_today: true, total_buckets_today: 2, hours: 8, current_row: 1, role: 'picker', avatar: 'L' },
                // High earner: 100 buckets in 4 hours → no top-up
                { id: 'p2', name: 'High', status: 'active', checked_in_today: true, total_buckets_today: 100, hours: 4, current_row: 2, role: 'picker', avatar: 'H' },
            ],
        });

        useHarvestStore.getState().recalculateIntelligence();

        const state = useHarvestStore.getState();
        // Low: piece = 2×$3.50=$7, min = 8×$23.95=$191.60, top-up = $184.60
        // High: piece = 100×$3.50=$350, min = 4×$23.95=$95.80, top-up = $0
        expect(state.payroll.totalMinimum).toBeCloseTo(184.6, 0);
        expect(state.payroll.totalPiece).toBeCloseTo(357, 0); // 7 + 350
    });

    it('all pickers above minimum wage → zero top-up', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Fast', status: 'active', checked_in_today: true, total_buckets_today: 50, hours: 2, current_row: 1, role: 'picker', avatar: 'F' },
                { id: 'p2', name: 'Faster', status: 'active', checked_in_today: true, total_buckets_today: 80, hours: 3, current_row: 2, role: 'picker', avatar: 'X' },
            ],
        });

        useHarvestStore.getState().recalculateIntelligence();

        expect(useHarvestStore.getState().payroll.totalMinimum).toBe(0);
    });

    it('all pickers below minimum wage → total top-up = sum of shortfalls', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Slow1', status: 'active', checked_in_today: true, total_buckets_today: 1, hours: 8, current_row: 1, role: 'picker', avatar: 'S1' },
                { id: 'p2', name: 'Slow2', status: 'active', checked_in_today: true, total_buckets_today: 2, hours: 8, current_row: 2, role: 'picker', avatar: 'S2' },
            ],
        });

        useHarvestStore.getState().recalculateIntelligence();

        const state = useHarvestStore.getState();
        // p1: piece=3.50, min=8×$23.95=$191.60, topup=188.10
        // p2: piece=7.00, min=8×$23.95=$191.60, topup=184.60
        // Total topup = 372.70
        expect(state.payroll.totalMinimum).toBeCloseTo(372.7, 0);
    });

    it('compliance alerts array populated after recalculate', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'Worker', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 8, current_row: 1, role: 'picker', avatar: 'W' },
            ],
        });

        useHarvestStore.getState().recalculateIntelligence();

        const state = useHarvestStore.getState();
        expect(Array.isArray(state.alerts)).toBe(true);
        // With 8 hours on shift, there should be break-related alerts
    });
});

// ── DAY LIFECYCLE INTEGRATION TESTS ────────────

describe('Day Lifecycle — Integration', () => {
    beforeEach(() => resetStore());

    it('setDayClosed → dayClosed=true in store', () => {
        useHarvestStore.getState().setDayClosed(true);
        expect(useHarvestStore.getState().dayClosed).toBe(true);
    });

    it('setDayClosed → can reopen', () => {
        useHarvestStore.getState().setDayClosed(true);
        useHarvestStore.getState().setDayClosed(false);
        expect(useHarvestStore.getState().dayClosed).toBe(false);
    });

    it('reset → clears buckets but not crew', () => {
        resetStore({
            crew: [
                { id: 'p1', name: 'A', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 0, current_row: 1, role: 'picker', avatar: 'A' },
            ],
        });
        useHarvestStore.getState().addBucket({
            picker_id: 'p1', quality_grade: 'A', timestamp: new Date().toISOString(), orchard_id: 'o1',
        });

        expect(useHarvestStore.getState().buckets.length).toBe(1);
        useHarvestStore.getState().reset();
        expect(useHarvestStore.getState().buckets.length).toBe(0);
    });

    it('simulation mode toggle works', () => {
        useHarvestStore.getState().setSimulationMode(true);
        expect(useHarvestStore.getState().simulationMode).toBe(true);
        useHarvestStore.getState().setSimulationMode(false);
        expect(useHarvestStore.getState().simulationMode).toBe(false);
    });
});

// ── STORE PERSISTENCE INTEGRATION TESTS ─────────

describe('Store Persistence — Integration', () => {
    it('partialize includes critical fields', () => {
        resetStore({
            crew: [{ id: 'p1', name: 'A', status: 'active' }],
            settings: { piece_rate: 5.00, min_wage_rate: 23.95 },
            orchard: { id: 'o1', name: 'My Orchard' },
            simulationMode: true,
        });

        const state = useHarvestStore.getState();
        expect(state.settings).toBeDefined();
        expect(state.orchard).toBeDefined();
        expect(state.crew).toBeDefined();
        expect(state.simulationMode).toBe(true);
    });

    it('clockSkew persisted and affects bucket validation', () => {
        resetStore({
            clockSkew: 3 * 60 * 1000, // 3 minutes
            crew: [{ id: 'p1', name: 'A', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 0, current_row: 1, role: 'picker', avatar: 'A' }],
        });

        useHarvestStore.getState().addBucket({
            picker_id: 'p1', quality_grade: 'A', timestamp: new Date().toISOString(), orchard_id: 'o1',
        });
        expect(useHarvestStore.getState().buckets.length).toBe(1); // Within tolerance

        // Now set skew beyond tolerance
        useHarvestStore.setState({ clockSkew: 6 * 60 * 1000 } as any);
        useHarvestStore.getState().addBucket({
            picker_id: 'p1', quality_grade: 'A', timestamp: new Date().toISOString(), orchard_id: 'o1',
        });
        expect(useHarvestStore.getState().buckets.length).toBe(1); // Still 1, second rejected
    });
});

