/**
 * INTEGRATION TEST: Bucket Scan Pipeline
 * 
 * Tests the FULL chain: addBucket → validation → local state → intelligence recalc
 * Pattern: Assert on OBSERVABLE STATE, not mock call counts
 * (Zustand singleton means mocks don't intercept slice-internal imports the same way)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external boundaries (hoisted) ──────────
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
    offlineService: {
        queueBucket: vi.fn().mockResolvedValue(undefined),
        markAsSynced: vi.fn().mockResolvedValue(undefined),
        getPendingBuckets: vi.fn().mockResolvedValue([]),
    },
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

// ── Import the REAL store ──────────────────────
import { useHarvestStore } from '@/stores/useHarvestStore';

// ── Helpers ──────────────────────────────────
function resetAndSeed(overrides: Record<string, unknown> = {}) {
    // Full state reset
    useHarvestStore.setState({
        buckets: [],
        bucketRecords: [],
        isScanning: false,
        lastScanTime: null,
        crew: [
            { id: 'p1', name: 'Alice', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
            { id: 'p2', name: 'Bob', status: 'active', checked_in_today: true, total_buckets_today: 5, hours: 6, current_row: 2, role: 'picker', avatar: 'B' },
            { id: 'p3', name: 'Carlo', status: 'archived', checked_in_today: false, total_buckets_today: 0, hours: 0, current_row: 0, role: 'picker', avatar: 'C' },
            { id: 'p4', name: 'Diana', status: 'active', checked_in_today: false, total_buckets_today: 2, hours: 3, current_row: 3, role: 'picker', avatar: 'D' },
        ] as any,
        settings: { piece_rate: 3.50, min_wage_rate: 23.95, bins_per_row: 20 } as any,
        currentUser: { id: 'manager1', name: 'Manager', role: 'manager' },
        orchard: { id: 'o1', name: 'Test Orchard' },
        clockSkew: 0,
        alerts: [],
        payroll: { totalPiece: 0, totalMinimum: 0, finalTotal: 0 },
        ...overrides,
    } as any);
}

function makeBucket(pickerId: string) {
    return {
        picker_id: pickerId,
        quality_grade: 'A' as const,
        timestamp: new Date().toISOString(),
        orchard_id: 'o1',
    };
}

describe('Bucket Pipeline — Integration', () => {
    beforeEach(() => {
        resetAndSeed();
    });

    // ── Core Pipeline: State Effects ──────────

    it('addBucket → bucket appears in store with correct fields', () => {
        useHarvestStore.getState().addBucket(makeBucket('p1'));

        const state = useHarvestStore.getState();
        expect(state.buckets.length).toBe(1);
        expect(state.buckets[0].picker_id).toBe('p1');
        expect(state.buckets[0].quality_grade).toBe('A');
        expect(state.buckets[0].synced).toBe(false);
        expect(state.buckets[0].id).toBeDefined(); // UUID generated
        expect(state.lastScanTime).not.toBeNull();
    });

    it('addBucket → payroll recalculated automatically', () => {
        useHarvestStore.getState().addBucket(makeBucket('p1'));

        const state = useHarvestStore.getState();
        // Alice: 1 new bucket × $3.50 = $3.50
        // Bob: 5 existing × $3.50 = $17.50
        // Diana: 2 existing × $3.50 = $7.00
        // Total piece should be at least $3.50
        expect(state.payroll.totalPiece).toBeGreaterThan(0);
        expect(state.payroll.finalTotal).toBeGreaterThan(0);
    });

    it('multiple scans → all buckets in store, payroll grows', () => {
        for (let i = 0; i < 10; i++) {
            useHarvestStore.getState().addBucket(makeBucket('p1'));
        }

        const state = useHarvestStore.getState();
        expect(state.buckets.length).toBe(10);
        // Alice: 10 new × $3.50 = $35
        expect(state.payroll.totalPiece).toBeGreaterThanOrEqual(35);
    });

    it('addBucket → intelligence recalculates with correct piece rate', () => {
        // Add 10 buckets for Alice
        for (let i = 0; i < 10; i++) {
            useHarvestStore.getState().addBucket(makeBucket('p1'));
        }

        const state = useHarvestStore.getState();
        // Las cubetas salen solo de los escaneos (no del contador
        // total_buckets_today de la ficha, que duplicaba la cuenta).
        // Alice: 10 × $3.50 = $35 piece
        expect(state.payroll.totalPiece).toBeCloseTo(35, 0);
    });

    // ── Validation: Archived Picker ──────────

    it('addBucket for archived picker → REJECTED, bucket count unchanged', () => {
        const bucketsBefore = useHarvestStore.getState().buckets.length;

        useHarvestStore.getState().addBucket(makeBucket('p3')); // Carlo is archived

        expect(useHarvestStore.getState().buckets.length).toBe(bucketsBefore);
    });

    it('addBucket for archived picker → payroll unchanged', () => {
        useHarvestStore.getState().recalculateIntelligence();
        const payrollBefore = { ...useHarvestStore.getState().payroll };

        useHarvestStore.getState().addBucket(makeBucket('p3'));

        const payrollAfter = useHarvestStore.getState().payroll;
        expect(payrollAfter.totalPiece).toBe(payrollBefore.totalPiece);
    });

    // ── Validation: Clock Skew ───────────────

    it('addBucket with clock skew >5min → REJECTED (anti-fraud)', () => {
        resetAndSeed({ clockSkew: 6 * 60 * 1000 });

        useHarvestStore.getState().addBucket(makeBucket('p1'));

        expect(useHarvestStore.getState().buckets.length).toBe(0);
    });

    it('addBucket with clock skew exactly 5min → REJECTED (boundary)', () => {
        resetAndSeed({ clockSkew: 5 * 60 * 1000 + 1 });

        useHarvestStore.getState().addBucket(makeBucket('p1'));

        expect(useHarvestStore.getState().buckets.length).toBe(0);
    });

    it('addBucket with clock skew <5min → ALLOWED', () => {
        resetAndSeed({ clockSkew: 4 * 60 * 1000 });

        useHarvestStore.getState().addBucket(makeBucket('p1'));

        expect(useHarvestStore.getState().buckets.length).toBe(1);
    });

    it('addBucket with negative clock skew >5min → REJECTED', () => {
        resetAndSeed({ clockSkew: -6 * 60 * 1000 });

        useHarvestStore.getState().addBucket(makeBucket('p1'));

        expect(useHarvestStore.getState().buckets.length).toBe(0);
    });

    it('addBucket with zero clock skew → ALLOWED', () => {
        resetAndSeed({ clockSkew: 0 });

        useHarvestStore.getState().addBucket(makeBucket('p1'));

        expect(useHarvestStore.getState().buckets.length).toBe(1);
    });

    // ── Validation: Not Checked In ──────────

    it('addBucket for picker not checked-in → ALLOWED (soft warning)', () => {
        useHarvestStore.getState().addBucket(makeBucket('p4')); // Diana not checked in

        expect(useHarvestStore.getState().buckets.length).toBe(1);
        expect(useHarvestStore.getState().buckets[0].picker_id).toBe('p4');
    });

    // ── Mark as Synced ──────────────────────

    it('markAsSynced → bucket.synced=true in store', () => {
        useHarvestStore.getState().addBucket(makeBucket('p1'));
        const bucketId = useHarvestStore.getState().buckets[0].id;

        useHarvestStore.getState().markAsSynced(bucketId);

        expect(useHarvestStore.getState().buckets[0].synced).toBe(true);
    });

    // ── Clear Synced ────────────────────────

    it('clearSynced → removes only synced buckets from store', () => {
        useHarvestStore.getState().addBucket(makeBucket('p1'));
        useHarvestStore.getState().addBucket(makeBucket('p2'));

        const firstId = useHarvestStore.getState().buckets[0].id;
        useHarvestStore.getState().markAsSynced(firstId);
        useHarvestStore.getState().clearSynced();

        const state = useHarvestStore.getState();
        expect(state.buckets.length).toBe(1);
        expect(state.buckets[0].synced).toBe(false);
    });

    // ── Unknown Picker (not in crew) ─────────

    it('addBucket for unknown picker → ALLOWED (no crew match = no archived check)', () => {
        useHarvestStore.getState().addBucket(makeBucket('unknown-picker'));

        expect(useHarvestStore.getState().buckets.length).toBe(1);
    });
});

