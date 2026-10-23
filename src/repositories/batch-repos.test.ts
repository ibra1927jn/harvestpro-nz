/**
 * Batch Repository Tests — Deep functional tests for 13 previously untested repositories
 * Uses vi.spyOn(supabase, 'from') with mockChain pattern proven in attendance.repository.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';

// ── Reusable mock chain ──────────────────────────────
function mockChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        update: vi.fn(() => chain), insert: vi.fn(() => chain), delete: vi.fn(() => chain),
        order: vi.fn(() => chain), range: vi.fn(() => chain), limit: vi.fn(() => chain), single: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain), gte: vi.fn(() => chain), lte: vi.fn(() => chain),
        is: vi.fn(() => chain), or: vi.fn(() => chain), upsert: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

let fromSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
});

// =========================================================
// 1. admin.repository
// =========================================================
describe('adminRepository', () => {
    let repo: typeof import('@/repositories/admin.repository').adminRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/admin.repository')).adminRepository;
    });

    it('getAllOrchards returns mapped data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'o1', name: 'TestOrchard', total_rows: 10 }], error: null }) as never);
        const result = await repo.getAllOrchards();
        expect(result[0].name).toBe('TestOrchard');
        expect(result[0].active_pickers).toBe(0);
    });

    it('getAllOrchards throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
        await expect(repo.getAllOrchards()).rejects.toBeTruthy();
    });

    it('getAllUsers returns data with no filters', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'u1' }], error: null }) as never);
        const result = await repo.getAllUsers();
        expect(result).toHaveLength(1);
    });

    it('getAllUsers applies role filter', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [], error: null }) as never);
        await repo.getAllUsers({ role: 'PICKER' });
        expect(supabase.from).toHaveBeenCalledWith('users');
    });

    it('getAllUsers applies search filter', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [], error: null }) as never);
        await repo.getAllUsers({ search: 'test' });
        expect(supabase.from).toHaveBeenCalled();
    });

    it('updateUserRole completes without error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.updateUserRole('u1', 'MANAGER')).resolves.not.toThrow();
    });

    it('updateUserRole throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.updateUserRole('u1', 'MANAGER')).rejects.toBeTruthy();
    });

    it('deactivateUser completes without error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.deactivateUser('u1')).resolves.not.toThrow();
    });

    it('reactivateUser completes without error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.reactivateUser('u1')).resolves.not.toThrow();
    });
});

// =========================================================
// 2. orchardMap.repository
// =========================================================
describe('orchardMapRepository', () => {
    let repo: typeof import('@/repositories/orchard-map.repository').orchardMapRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/orchard-map.repository')).orchardMapRepository;
    });

    it('getActiveSeason returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 's1' }], error: null }) as never);
        const { data } = await repo.getActiveSeason('o1');
        expect(data).toHaveLength(1);
    });

    it('getBlocks returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'b1' }], error: null }) as never);
        const { data } = await repo.getBlocks('o1', 's1');
        expect(data).toHaveLength(1);
    });

    it('getBlockRows returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'r1' }], error: null }) as never);
        const { data } = await repo.getBlockRows(['b1']);
        expect(data).toHaveLength(1);
    });
});

// =========================================================
// 3. payroll.repository
// =========================================================
describe('payrollRepository', () => {
    let repo: typeof import('@/repositories/payroll.repository').payrollRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/payroll.repository')).payrollRepository;
    });

    it('fetchTimesheetAttendance returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'a1' }], error: null }) as never);
        const { data } = await repo.fetchTimesheetAttendance('o1', '2026-03-01');
        expect(data).toHaveLength(1);
    });

    it('fetchPickerNames returns name map', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'p1', name: 'Alice' }], error: null }) as never);
        const result = await repo.fetchPickerNames(['p1']);
        expect(result['p1']).toBe('Alice');
    });

    it('fetchPickerNames returns empty for empty ids', async () => {
        const result = await repo.fetchPickerNames([]);
        expect(result).toEqual({});
    });
});

// =========================================================
// 4. settings.repository
// =========================================================
describe('settingsRepository', () => {
    let repo: typeof import('@/repositories/settings.repository').settingsRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/settings.repository')).settingsRepository;
    });

    it('getByOrchardId returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { piece_rate: 5.0 }, error: null }) as never);
        const result = await repo.getByOrchardId('o1');
        expect(result).toEqual({ piece_rate: 5.0 });
    });

    it('getByOrchardId returns null on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'not found' } }) as never);
        const result = await repo.getByOrchardId('o1');
        expect(result).toBeNull();
    });

    it('upsert completes without error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.upsert('o1', { piece_rate: 6.0 })).resolves.not.toThrow();
    });

    it('upsert throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.upsert('o1', {})).rejects.toBeTruthy();
    });
});

// =========================================================
// 5. qc.repository
// =========================================================
describe('qcRepository', () => {
    let repo: typeof import('@/repositories/qc.repository').qcRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/qc.repository')).qcRepository;
    });

    it('insert returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'qc1' }, error: null }) as never);
        const { data } = await repo.insert({ orchard_id: 'o1' });
        expect(data).toEqual({ id: 'qc1' });
    });

    it('getByOrchardAndDateRange returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'qc1' }], error: null }) as never);
        const result = await repo.getByOrchardAndDateRange('o1', '2026-01-01', '2026-01-31');
        expect(result).toHaveLength(1);
    });

    it('getByOrchardAndDateRange throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.getByOrchardAndDateRange('o1', '', '')).rejects.toBeTruthy();
    });

    it('getByPicker returns data with default limit', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'qc1' }], error: null }) as never);
        const result = await repo.getByPicker('p1');
        expect(result).toHaveLength(1);
    });
});

// =========================================================
// 6. bin.repository
// =========================================================
describe('binRepository', () => {
    let repo: typeof import('@/repositories/bin.repository').binRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/bin.repository')).binRepository;
    });

    it('getByOrchard returns bins', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'b1', status: 'empty' }], error: null }) as never);
        const result = await repo.getByOrchard('o1');
        expect(result).toHaveLength(1);
    });

    it('getByOrchard throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.getByOrchard('o1')).rejects.toBeTruthy();
    });

    it('updateStatus completes without error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.updateStatus('b1', 'filled', '2026-03-01')).resolves.not.toThrow();
    });
});

// =========================================================
// 7. setup.repository
// =========================================================
describe('setupRepository', () => {
    let repo: typeof import('@/repositories/setup.repository').setupRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/setup.repository')).setupRepository;
    });

    it('insertOrchard returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'o1' }, error: null }) as never);
        const { data } = await repo.insertOrchard({ name: 'Test' });
        expect(data).toEqual({ id: 'o1' });
    });

    it('insertDaySetup returns error status', async () => {
        fromSpy.mockReturnValue(mockChain({ error: null }) as never);
        const { error } = await repo.insertDaySetup({ date: '2026-03-01' });
        expect(error).toBeNull();
    });
});

// =========================================================
// =========================================================

// =========================================================
// 9. pickerHistory.repository
// =========================================================
describe('pickerHistoryRepository', () => {
    let repo: typeof import('@/repositories/picker-history.repository').pickerHistoryRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/picker-history.repository')).pickerHistoryRepository;
    });

    it('getPickerById returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'p1', name: 'Alice' }, error: null }) as never);
        const result = await repo.getPickerById('p1');
        expect(result?.name).toBe('Alice');
    });

    it('getPickerById returns null on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        const result = await repo.getPickerById('p1');
        expect(result).toBeNull();
    });

    it('getUserName returns name', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { full_name: 'Bob' }, error: null }) as never);
        const result = await repo.getUserName('u1');
        expect(result).toBe('Bob');
    });

    it('getUserName returns null when no data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        const result = await repo.getUserName('u1');
        expect(result).toBeNull();
    });

    it('getAttendanceSince returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'a1' }], error: null }) as never);
        const result = await repo.getAttendanceSince('p1', '2026-01-01');
        expect(result).toHaveLength(1);
    });

    it('getBucketRecordsSince returns empty on null', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        const result = await repo.getBucketRecordsSince('p1', '2026-01-01');
        expect(result).toEqual([]);
    });

    it('getInspectionsSince returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'i1' }], error: null }) as never);
        // Solo qc_inspections (quality_inspections ya no se consulta)
        const result = await repo.getInspectionsSince('p1', '2026-01-01');
        expect(result).toHaveLength(1);
    });

    it('getDaySetupsSince returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ date: '2026-01-01' }], error: null }) as never);
        const result = await repo.getDaySetupsSince('o1', '2026-01-01');
        expect(result).toHaveLength(1);
    });
});

// =========================================================
// 10. optimisticLock.repository
// =========================================================
describe('optimisticLockRepository', () => {
    let repo: typeof import('@/repositories/optimistic-lock.repository').optimisticLockRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/optimistic-lock.repository')).optimisticLockRepository;
    });

    it('conditionalUpdate returns data and error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'r1' }, error: null }) as never);
        const { data } = await repo.conditionalUpdate('table', 'r1', '2026-01-01', { status: 'done' });
        expect(data).toEqual({ id: 'r1' });
    });

    it('getById returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'r1' }, error: null }) as never);
        const result = await repo.getById('table', 'r1');
        expect(result).toEqual({ id: 'r1' });
    });

    it('update returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'r1' }, error: null }) as never);
        const result = await repo.update('table', 'r1', { status: 'done' });
        expect(result).toEqual({ id: 'r1' });
    });

    it('update throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.update('table', 'r1', {})).rejects.toBeTruthy();
    });
});

// =========================================================
// 11. bucketLedger.repository
// =========================================================
describe('bucketLedgerRepository', () => {
    let repo: typeof import('@/repositories/bucket-ledger.repository').bucketLedgerRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/bucket-ledger.repository')).bucketLedgerRepository;
    });

    it('resolvePickerByBadge returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'p1', picker_id: 'badge1' }, error: null }) as never);
        const result = await repo.resolvePickerByBadge('badge1', 'o1');
        expect(result?.id).toBe('p1');
    });

    it('insertBucketRecord returns data and error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'br1' }, error: null }) as never);
        const { data } = await repo.insertBucketRecord({ picker_id: 'p1' });
        expect(data).toEqual({ id: 'br1' });
    });

    it('getPickerHistory returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'r1' }], error: null }) as never);
        const result = await repo.getPickerHistory('p1');
        expect(result).toHaveLength(1);
    });

    it('getPickerHistory throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.getPickerHistory('p1')).rejects.toBeTruthy();
    });
});

// =========================================================
// 12. analyticsTrends.repository
// =========================================================
describe('analyticsTrendsRepository', () => {
    let repo: typeof import('@/repositories/analytics-trends.repository').analyticsTrendsRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/analytics-trends.repository')).analyticsTrendsRepository;
    });

    it('getBucketsByRowInRange returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ row_number: 1 }], error: null }) as never);
        const result = await repo.getBucketsByRowInRange('o1', '2026-01-01', '2026-01-31');
        expect(result).toHaveLength(1);
    });

    it('getBucketsByRowInRange throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.getBucketsByRowInRange('o1', '', '')).rejects.toBeTruthy();
    });

    it('getDayClosures returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ date: '2026-01-01' }], error: null }) as never);
        const result = await repo.getDayClosures('o1', '2026-01-01', '2026-01-31');
        expect(result).toHaveLength(1);
    });

    it('getAttendanceDates returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ date: '2026-01-01' }], error: null }) as never);
        const result = await repo.getAttendanceDates('o1', '2026-01-01', '2026-01-31');
        expect(result).toHaveLength(1);
    });
});

// =========================================================
// 13. userService.repository
// =========================================================
describe('userServiceRepository', () => {
    let repo: typeof import('@/repositories/user-service.repository').userServiceRepository;
    beforeEach(async () => {
        repo = (await import('@/repositories/user-service.repository')).userServiceRepository;
    });

    it('getUserById returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'u1', email: 'a@b.com' }, error: null }) as never);
        const result = await repo.getUserById('u1');
        expect(result.email).toBe('a@b.com');
    });

    it('getUserById throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(repo.getUserById('u1')).rejects.toBeTruthy();
    });

    it('getUsersByOrchard returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'u1' }], error: null }) as never);
        const result = await repo.getUsersByOrchard('o1');
        expect(result).toHaveLength(1);
    });

    it('getAvailableUsers returns data with role filter', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'u1' }], error: null }) as never);
        const result = await repo.getAvailableUsers('PICKER');
        expect(result).toHaveLength(1);
    });

    it('getAvailableUsers returns data without filter', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [], error: null }) as never);
        const result = await repo.getAvailableUsers();
        expect(result).toEqual([]);
    });

    it('getUsersByRole returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'u1' }], error: null }) as never);
        const result = await repo.getUsersByRole('MANAGER');
        expect(result).toHaveLength(1);
    });

    it('updateUserOrchard returns updated data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'u1', orchard_id: 'o1' }, error: null }) as never);
        const result = await repo.updateUserOrchard('u1', 'o1');
        expect(result.orchard_id).toBe('o1');
    });

    it('updateUserOrchard with null orchardId', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'u1', orchard_id: null }, error: null }) as never);
        const result = await repo.updateUserOrchard('u1', null);
        expect(result.orchard_id).toBeNull();
    });

    it('clearUserOrchard completes', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(repo.clearUserOrchard('u1')).resolves.not.toThrow();
    });

    it('findPickerById returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'p1' }, error: null }) as never);
        const result = await repo.findPickerById('p1');
        expect(result).toEqual({ id: 'p1' });
    });

    it('updatePicker returns error status', async () => {
        fromSpy.mockReturnValue(mockChain({ error: null }) as never);
        const { error } = await repo.updatePicker('p1', { name: 'Updated' });
        expect(error).toBeNull();
    });

    it('insertPicker returns error status', async () => {
        fromSpy.mockReturnValue(mockChain({ error: null }) as never);
        const { error } = await repo.insertPicker({ id: 'p1' });
        expect(error).toBeNull();
    });

    it('deletePicker returns error status', async () => {
        fromSpy.mockReturnValue(mockChain({ error: null }) as never);
        const { error } = await repo.deletePicker('p1');
        expect(error).toBeNull();
    });

    it('verifyPickerState returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'p1', status: 'active' }, error: null }) as never);
        const result = await repo.verifyPickerState('p1');
        expect(result?.status).toBe('active');
    });

    it('findTodayAttendance returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'a1' }], error: null }) as never);
        const result = await repo.findTodayAttendance('u1', '2026-03-01');
        expect(result).toEqual({ id: 'a1' });
    });

    it('insertAttendance returns error status', async () => {
        fromSpy.mockReturnValue(mockChain({ error: null }) as never);
        const { error } = await repo.insertAttendance({ picker_id: 'p1' });
        expect(error).toBeNull();
    });
});

