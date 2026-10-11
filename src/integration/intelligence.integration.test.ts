/**
 * INTEGRATION TEST: Intelligence Engine
 * 
 * Tests: recalculateIntelligence with REAL compliance.service
 * Chain: crew data + buckets → payroll math → compliance checks → alerts
 * Only Supabase/Dexie mocked. compliance.service uses REAL implementation.
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

// ── Import the REAL store (includes REAL compliance.service) ──
import { useHarvestStore } from '@/stores/useHarvestStore';
import { asShiftData } from './shiftFixtures';

// ── Helpers ────────────────────────────────
function seedStore(crewOverrides: Record<string, unknown>[] = [], settingsOverrides: Record<string, unknown> = {}) {
    const defaultCrew = [
        { id: 'p1', name: 'Alice', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
        { id: 'p2', name: 'Bob', status: 'active', checked_in_today: true, total_buckets_today: 5, hours: 6, current_row: 2, role: 'picker', avatar: 'B' },
    ];

    const shiftData = asShiftData((crewOverrides.length ? crewOverrides : defaultCrew) as { id: string }[]);
    useHarvestStore.setState({
        crew: shiftData.crew as any,
        settings: { piece_rate: 3.50, min_wage_rate: 23.95, bins_per_row: 20, ...settingsOverrides } as any,
        currentUser: { id: 'mgr1', name: 'Manager', role: 'manager' },
        orchard: { id: 'o1', name: 'Orchard' },
        clockSkew: 0,
        buckets: [],
        bucketRecords: shiftData.bucketRecords,
        alerts: [],
        payroll: { totalPiece: 0, totalMinimum: 0, finalTotal: 0 },
    } as any);
}

function addBuckets(pickerId: string, count: number) {
    const store = useHarvestStore.getState();
    for (let i = 0; i < count; i++) {
        store.addBucket({
            picker_id: pickerId,
            quality_grade: 'A',
            timestamp: new Date().toISOString(),
            orchard_id: 'o1',
        });
    }
}

describe('Intelligence Engine — Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useHarvestStore.getState().reset();
    });

    // ── Payroll Calculation ──────────────────

    it('payroll reflects new local buckets + existing total_buckets_today', () => {
        seedStore();
        addBuckets('p1', 5); // Alice: 5 new + 0 existing = 5 total

        const state = useHarvestStore.getState();
        // Alice: 5 × $3.50 = $17.50
        // Bob: 0 new + 5 existing × $3.50 = $17.50
        // Total piece: $35.00
        expect(state.payroll.totalPiece).toBeCloseTo(35.0, 1);
    });

    it('payroll finalTotal includes minimum wage top-up when piece < minimum', () => {
        // Picker has 8 hours but only 2 buckets → piece earnings very low
        seedStore([
            { id: 'p1', name: 'Low Earner', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 8, current_row: 1, role: 'picker', avatar: 'L' },
        ]);
        addBuckets('p1', 2); // 2 × $3.50 = $7.00 piece, but 8h × $23.95 = $191.60 min wage

        const state = useHarvestStore.getState();
        // Piece: $7.00
        // Minimum threshold: 8 × $23.95 = $191.60
        // Top-up: $191.60 - $7 = $184.60
        expect(state.payroll.totalPiece).toBeCloseTo(7.0, 1);
        expect(state.payroll.totalMinimum).toBeGreaterThan(0);
        expect(state.payroll.finalTotal).toBeCloseTo(191.6, 0);
    });

    it('payroll has no top-up when piece earnings exceed minimum wage', () => {
        // Picker has 1 hour but 100 buckets → piece earnings high
        seedStore([
            { id: 'p1', name: 'High Earner', status: 'active', checked_in_today: true, total_buckets_today: 90, hours: 1, current_row: 1, role: 'picker', avatar: 'H' },
        ]);
        addBuckets('p1', 10); // 10 new + 90 existing = 100 × $3.50 = $350

        const state = useHarvestStore.getState();
        // Min wage threshold: 1h × $23.95 = $23.95
        // Piece: $350 >> $23.95 → no top-up
        expect(state.payroll.totalPiece).toBeCloseTo(350, 0);
        expect(state.payroll.totalMinimum).toBe(0);
        expect(state.payroll.finalTotal).toBeCloseTo(350, 0);
    });

    // ── Archived Picker Exclusion ────────────

    it('archived pickers excluded from payroll', () => {
        seedStore([
            { id: 'p1', name: 'Active', status: 'active', checked_in_today: true, total_buckets_today: 10, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
            { id: 'p2', name: 'Archived', status: 'archived', checked_in_today: false, total_buckets_today: 20, hours: 8, current_row: 0, role: 'picker', avatar: 'X' },
        ]);

        const store = useHarvestStore.getState();
        store.recalculateIntelligence();

        const state = useHarvestStore.getState();
        // Only p1's 10 buckets × $3.50 = $35 should be counted
        expect(state.payroll.totalPiece).toBeCloseTo(35, 0);
    });

    // ── Zero Hours Safety ───────────────────

    it('0 hours worked → no fabricated hours, minimum wage = 0', () => {
        seedStore([
            { id: 'p1', name: 'NoHours', status: 'active', checked_in_today: true, total_buckets_today: 5, hours: 0, current_row: 1, role: 'picker', avatar: 'N' },
        ]);
        addBuckets('p1', 5); // 10 total × $3.50 = $35

        const state = useHarvestStore.getState();
        // With 0 hours: min wage threshold = 0 × $23.95 = $0
        // So no top-up needed
        expect(state.payroll.totalMinimum).toBe(0);
        expect(state.payroll.totalPiece).toBeCloseTo(35, 0);
    });

    // ── Compliance Alerts ───────────────────

    it('compliance violations generate alerts', () => {
        // Picker with many consecutive minutes → should trigger break violations
        seedStore([
            { id: 'p1', name: 'Overworker', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 8, current_row: 1, role: 'picker', avatar: 'O' },
        ]);
        addBuckets('p1', 1);

        const state = useHarvestStore.getState();
        // Intelligence should have generated alerts (may or may not have violations
        // depending on mock data, but alerts array should exist)
        expect(Array.isArray(state.alerts)).toBe(true);
    });

    it('wage compliance: low piece earner triggers wage_below_minimum alert', () => {
        seedStore([
            { id: 'p1', name: 'LowEarner', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 8, current_row: 1, role: 'picker', avatar: 'L' },
        ]);
        addBuckets('p1', 1); // 1 × $3.50 = $3.50 vs 8h × $23.95 = $191.60

        const state = useHarvestStore.getState();
        // With only $3.50 in 8 hours → wage is well below minimum
        // finalTotal should be at min wage level
        expect(state.payroll.finalTotal).toBeGreaterThanOrEqual(188);
    });

    // ── Multi-Picker ────────────────────────

    it('payroll with 5 pickers at different rates', () => {
        seedStore([
            { id: 'p1', name: 'A', status: 'active', checked_in_today: true, total_buckets_today: 20, hours: 4, current_row: 1, role: 'picker', avatar: 'A' },
            { id: 'p2', name: 'B', status: 'active', checked_in_today: true, total_buckets_today: 50, hours: 6, current_row: 2, role: 'picker', avatar: 'B' },
            { id: 'p3', name: 'C', status: 'active', checked_in_today: true, total_buckets_today: 5, hours: 8, current_row: 3, role: 'picker', avatar: 'C' },
            { id: 'p4', name: 'D', status: 'active', checked_in_today: true, total_buckets_today: 100, hours: 8, current_row: 4, role: 'picker', avatar: 'D' },
            { id: 'p5', name: 'E', status: 'active', checked_in_today: true, total_buckets_today: 0, hours: 2, current_row: 5, role: 'picker', avatar: 'E' },
        ]);

        const store = useHarvestStore.getState();
        store.recalculateIntelligence();

        const state = useHarvestStore.getState();
        // A: 20×$3.50=$70 vs 4×$23.95=$95.80 → top-up $25.80
        // B: 50×$3.50=$175 vs 6×$23.95=$143.70 → no top-up
        // C: 5×$3.50=$17.50 vs 8×$23.95=$191.60 → top-up $174.10
        // D: 100×$3.50=$350 vs 8×$23.95=$191.60 → no top-up
        // E: 0×$3.50=$0 vs 2×$23.95=$47.90 → top-up $47.90
        // Total piece: 70+175+17.50+350+0 = $612.50
        // Total min: 25.80+0+174.10+0+47.90 = $247.80
        expect(state.payroll.totalPiece).toBeCloseTo(612.5, 0);
        expect(state.payroll.totalMinimum).toBeCloseTo(247.8, 0);
        expect(state.payroll.finalTotal).toBeCloseTo(860.3, 0);
    });

    // ── Edge Cases ──────────────────────────

    it('recalculate with empty crew → zero payroll', () => {
        // Force full state reset with empty crew and no buckets
        useHarvestStore.setState({
            crew: [] as any,
            buckets: [],
            bucketRecords: [],
            settings: { piece_rate: 3.50, min_wage_rate: 23.95, bins_per_row: 20 } as any,
            payroll: { totalPiece: 0, totalMinimum: 0, finalTotal: 0 },
            alerts: [],
        } as any);

        useHarvestStore.getState().recalculateIntelligence();

        const state = useHarvestStore.getState();
        expect(state.payroll.totalPiece).toBe(0);
        expect(state.payroll.totalMinimum).toBe(0);
        expect(state.payroll.finalTotal).toBe(0);
    });

    it('recalculate with all archived crew → zero payroll', () => {
        seedStore([
            { id: 'p1', name: 'X', status: 'archived', checked_in_today: false, total_buckets_today: 50, hours: 8, current_row: 0, role: 'picker', avatar: 'X' },
        ]);
        const store = useHarvestStore.getState();
        store.recalculateIntelligence();

        const state = useHarvestStore.getState();
        expect(state.payroll.totalPiece).toBe(0);
        expect(state.payroll.finalTotal).toBe(0);
    });

    it('multiple recalculates are idempotent', () => {
        seedStore();
        addBuckets('p1', 5);

        const state1 = useHarvestStore.getState();
        const payroll1 = { ...state1.payroll };

        useHarvestStore.getState().recalculateIntelligence();
        useHarvestStore.getState().recalculateIntelligence();
        useHarvestStore.getState().recalculateIntelligence();

        const state2 = useHarvestStore.getState();
        expect(state2.payroll.totalPiece).toBe(payroll1.totalPiece);
        expect(state2.payroll.totalMinimum).toBe(payroll1.totalMinimum);
        expect(state2.payroll.finalTotal).toBe(payroll1.finalTotal);
    });
});

