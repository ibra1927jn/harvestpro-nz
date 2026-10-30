/**
 * useQC Hook Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/services/qc.service', () => ({
    qcService: {
        getInspections: vi.fn().mockResolvedValue([
            { id: 'i1', picker_id: 'p1', quality_grade: 'A' },
            { id: 'i2', picker_id: 'p2', quality_grade: 'B' },
        ]),
        getGradeDistribution: vi.fn().mockResolvedValue({ A: 0, B: 0, C: 0, reject: 0, total: 0 }),
        logInspection: vi.fn().mockResolvedValue({ id: 'i3' }),
        submitGrade: vi.fn().mockResolvedValue({ id: 'i3' }),
        uploadPhoto: vi.fn().mockResolvedValue('https://cdn.example.com/photo.jpg'),
    },
}));

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((selector?: (s: any) => unknown) => {
        const state = {
            crew: [
                { id: 'p1', name: 'Alice', picker_id: '101', total_buckets_today: 10 },
                { id: 'p2', name: 'Bob', picker_id: '102', total_buckets_today: 5 },
            ],
            orchard: { id: 'o1', name: 'Test Orchard' },
        };
        if (typeof selector === 'function') return selector(state);
        return state;
    }),
}));

const authState = { appUser: { id: 'u1', role: 'qc_inspector' } as { id: string; role: string } | null };
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => authState,
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useQC } from './useQC';

describe('useQC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('provides crew data from store', () => {
        const { result } = renderHook(() => useQC());
        expect(result.current.crew).toHaveLength(2);
        expect(result.current.crew[0].name).toBe('Alice');
    });

    it('provides orchardId from store', () => {
        const { result } = renderHook(() => useQC());
        expect(result.current.orchardId).toBe('o1');
    });

    it('has initial state values', () => {
        const { result } = renderHook(() => useQC());
        expect(result.current.selectedPicker).toBeNull();
        expect(result.current.notes).toBe('');
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.lastGrade).toBeNull();
    });

    it('provides loadInspections function', () => {
        const { result } = renderHook(() => useQC());
        expect(typeof result.current.loadInspections).toBe('function');
    });

    it('provides handleGrade function', () => {
        const { result } = renderHook(() => useQC());
        expect(typeof result.current.handleGrade).toBe('function');
    });

    it('setSelectedPicker updates picker', () => {
        const { result } = renderHook(() => useQC());
        act(() => {
            result.current.setSelectedPicker(result.current.crew[0]);
        });
        expect(result.current.selectedPicker).toStrictEqual(result.current.crew[0]);
    });

    it('setNotes updates notes', () => {
        const { result } = renderHook(() => useQC());
        act(() => {
            result.current.setNotes('Test note');
        });
        expect(result.current.notes).toBe('Test note');
    });

    describe('canViewWellbeing', () => {
        it('is false for the QC inspector (wellbeing answers are not part of the public profile)', () => {
            authState.appUser = { id: 'u1', role: 'qc_inspector' };
            const { result } = renderHook(() => useQC());
            expect(result.current.canViewWellbeing).toBe(false);
        });

        it.each(['team_leader', 'manager', 'hr_admin', 'admin'])('is true for %s', role => {
            authState.appUser = { id: 'u1', role };
            const { result } = renderHook(() => useQC());
            expect(result.current.canViewWellbeing).toBe(true);
        });

        it.each(['runner', 'logistics', 'payroll_admin'])('is false for %s', role => {
            authState.appUser = { id: 'u1', role };
            const { result } = renderHook(() => useQC());
            expect(result.current.canViewWellbeing).toBe(false);
        });

        it('is false without a user', () => {
            authState.appUser = null;
            const { result } = renderHook(() => useQC());
            expect(result.current.canViewWellbeing).toBe(false);
        });
    });

    describe('handleGrade', () => {
        it('passes the details through and defaults the row to the picker current row', async () => {
            authState.appUser = { id: 'u1', role: 'qc_inspector' };
            const { qcService } = await import('@/services/qc.service');
            const { result } = renderHook(() => useQC());
            act(() => {
                result.current.setSelectedPicker({ ...result.current.crew[0], current_row: 4 });
            });
            let saved = false;
            await act(async () => {
                saved = await result.current.handleGrade('B', null, { criteria: { size: 'warn' }, score: 50, informed: true });
            });
            expect(saved).toBe(true);
            expect(vi.mocked(qcService.logInspection)).toHaveBeenCalledWith(expect.objectContaining({
                orchardId: 'o1', pickerId: 'p1', inspectorId: 'u1', grade: 'B',
                criteria: { size: 'warn' }, score: 50, informed: true, rowNumber: 4,
            }));
        });

        it('row is null when the picker has no row', async () => {
            const { qcService } = await import('@/services/qc.service');
            const { result } = renderHook(() => useQC());
            act(() => {
                result.current.setSelectedPicker({ ...result.current.crew[1], current_row: 0 });
            });
            await act(async () => {
                await result.current.handleGrade('A');
            });
            expect(vi.mocked(qcService.logInspection)).toHaveBeenLastCalledWith(expect.objectContaining({ pickerId: 'p2', rowNumber: null }));
        });
    });
});
