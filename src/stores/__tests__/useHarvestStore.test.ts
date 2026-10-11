import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarvestStore } from '../useHarvestStore';
import type { Picker } from '@/types';

/**
 * FASE 9: Unit Tests - useHarvestStore
 * 
 * Critical tests for Phase 9 functionality:
 * - Offline attendance validation
 * - Clock skew detection
 * - Archived picker exclusion
 * - Soft delete behavior
 * - Payroll calculations
 */

// Helper function to create mock picker with all required fields
const createMockPicker = (overrides: Partial<Picker>): Picker => ({
    id: 'picker-default',
    picker_id: 'PD001',
    name: 'Default Picker',
    avatar: 'DP',
    current_row: 1,
    total_buckets_today: 0,
    hours: 0,
    status: 'active',
    safety_verified: true,
    qcStatus: [1, 1, 1], // Good quality
    orchard_id: 'orchard-001',
    team_leader_id: undefined,
    checked_in_today: false,
    ...overrides,
});

describe('useHarvestStore - Phase 9 Validations', () => {
    describe('addBucket - Attendance Validation', () => {
        it('allows bucket with warning if picker not checked in (soft-gate for offline compatibility)', () => {
            const { result } = renderHook(() => useHarvestStore());

            // Setup crew with unchecked picker
            act(() => {
                result.current.crew = [createMockPicker({
                    id: 'picker-001',
                    name: 'Unchecked Picker',
                    checked_in_today: false, // NOT checked in
                })];
                result.current.clockSkew = 0; // No clock issues
            });

            const initialBucketCount = result.current.buckets.length;

            // Attempt to add bucket
            act(() => {
                result.current.addBucket({
                    picker_id: 'picker-001',
                    orchard_id: 'orchard-001',
                    quality_grade: 'A',
                    timestamp: new Date().toISOString(),
                });
            });

            // Fix 5: Bucket SHOULD be added (soft-warning, not hard-reject)
            // In offline scenarios, Team Leader's check-in may not have synced to Runner's device
            expect(result.current.buckets.length).toBe(initialBucketCount + 1);
        });

        it('accepts bucket if picker checked in', () => {
            const { result } = renderHook(() => useHarvestStore());

            // Setup crew with checked-in picker
            act(() => {
                result.current.crew = [createMockPicker({
                    id: 'picker-002',
                    name: 'Checked Picker',
                    checked_in_today: true, // CHECKED IN
                    check_in: new Date().toISOString(),
                })];
                result.current.clockSkew = 0; // No clock issues
            });

            const initialBucketCount = result.current.buckets.length;

            // Add bucket
            act(() => {
                result.current.addBucket({
                    picker_id: 'picker-002',
                    orchard_id: 'orchard-001',
                    quality_grade: 'B',
                    timestamp: new Date().toISOString(),
                });
            });

            // Bucket SHOULD be added
            expect(result.current.buckets.length).toBe(initialBucketCount + 1);
        });

        it('rejects bucket if picker archived', () => {
            const { result } = renderHook(() => useHarvestStore());

            // Setup crew with archived picker
            act(() => {
                result.current.crew = [createMockPicker({
                    id: 'picker-003',
                    name: 'Archived Picker',
                    status: 'archived', // ARCHIVED
                    checked_in_today: true,
                    archived_at: new Date().toISOString(),
                })];
            });

            const initialBucketCount = result.current.buckets.length;

            // Attempt to add bucket
            act(() => {
                result.current.addBucket({
                    picker_id: 'picker-003',
                    orchard_id: 'orchard-001',
                    quality_grade: 'C',
                    timestamp: new Date().toISOString(),
                });
            });

            // Bucket should NOT be added
            expect(result.current.buckets.length).toBe(initialBucketCount);
        });
    });

    describe('addBucket - Timestamp Validation', () => {
        it('rejects bucket if clock skew > 5 minutes', () => {
            const { result } = renderHook(() => useHarvestStore());

            // Setup checked-in picker with clock skew
            act(() => {
                result.current.crew = [createMockPicker({
                    id: 'picker-004',
                    name: 'Skew Picker',
                    checked_in_today: true,
                })];
                result.current.clockSkew = 10 * 60 * 1000; // 10 minutes skew
            });

            const initialBucketCount = result.current.buckets.length;

            // Attempt to add bucket
            act(() => {
                result.current.addBucket({
                    picker_id: 'picker-004',
                    orchard_id: 'orchard-001',
                    quality_grade: 'A',
                    timestamp: new Date().toISOString(),
                });
            });

            // Bucket should NOT be added
            expect(result.current.buckets.length).toBe(initialBucketCount);
        });

        it('accepts bucket if clock skew < 5 minutes', () => {
            const { result } = renderHook(() => useHarvestStore());

            act(() => {
                result.current.crew = [createMockPicker({
                    id: 'picker-005',
                    name: 'Normal Picker',
                    checked_in_today: true,
                })];
                result.current.clockSkew = 2 * 60 * 1000; // 2 minutes skew (OK)
            });

            const initialBucketCount = result.current.buckets.length;

            // Add bucket
            act(() => {
                result.current.addBucket({
                    picker_id: 'picker-005',
                    orchard_id: 'orchard-001',
                    quality_grade: 'A',
                    timestamp: new Date().toISOString(),
                });
            });

            // Bucket SHOULD be added
            expect(result.current.buckets.length).toBe(initialBucketCount + 1);
        });
    });

    describe('recalculateIntelligence - Archived Picker Filtering', () => {
        it('excludes archived pickers from payroll', () => {
            const { result } = renderHook(() => useHarvestStore());

            // Setup crew with active and archived pickers
            act(() => {
                result.current.crew = [
                    createMockPicker({
                        id: 'picker-active',
                        name: 'Active Picker',
                        status: 'active',
                        total_buckets_today: 10,
                        hours: 4,
                    }),
                    createMockPicker({
                        id: 'picker-archived',
                        name: 'Archived Picker',
                        status: 'archived', // Should be excluded
                        total_buckets_today: 20,
                        hours: 4,
                        archived_at: new Date().toISOString(),
                    }),
                ];
                result.current.settings = {
                    piece_rate: 5.00,
                    min_wage_rate: 23.95,
                    min_buckets_per_hour: 5,
                    target_tons: 100,
                };
            });

            // Las cubetas salen de los escaneos (no del contador de la ficha)
            act(() => {
                const scan = (pickerId: string, i: number) => ({
                    id: `${pickerId}-${i}`, picker_id: pickerId, bin_id: '', timestamp: new Date().toISOString(),
                    scanned_at: new Date().toISOString(), quality_grade: 'A' as const,
                });
                result.current.bucketRecords = [
                    ...Array.from({ length: 10 }, (_, i) => scan('picker-active', i)),
                    ...Array.from({ length: 20 }, (_, i) => scan('picker-archived', i)),
                ];
            });

            // Recalculate payroll
            act(() => {
                result.current.recalculateIntelligence();
            });

            // Only active picker should be counted
            // Active: 10 buckets only, not 30
            const activePicker = result.current.crew.find(p => p.id === 'picker-active');
            expect(activePicker).toBeDefined();
            expect(activePicker?.total_buckets_today).toBe(10);

            // Archived picker should not affect total
            const archivedPicker = result.current.crew.find(p => p.id === 'picker-archived');
            expect(archivedPicker?.status).toBe('archived');
        });
    });

    describe('State Management', () => {
        it('initializes with correct default clockSkew', () => {
            const { result } = renderHook(() => useHarvestStore());

            expect(result.current.clockSkew).toBeDefined();
            // Default clockSkew is 0 (no skew until server time is fetched)
            expect(result.current.clockSkew).toBe(0);
        });

        it('stores serverTimestamp on fetch', () => {
            const { result } = renderHook(() => useHarvestStore());

            expect(result.current.serverTimestamp).toBeDefined();
            // Should be null initially or a number after fetch
        });
    });
});
