/**
 * ============================================
 * contract.processor.test.ts
 * Regression tests for R9-Fix4: $0 hourly_rate not treated as falsy
 * ============================================
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ──────────────────────────
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn();
const mockEq = vi.fn();

import { supabase } from '../supabase';

vi.mock('../optimistic-lock.service', () => ({
    withOptimisticLock: vi.fn().mockResolvedValue({ success: true }),
}));

import { processContract } from './contract.processor';

describe('processContract', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockInsert.mockClear().mockResolvedValue({ error: null });
        mockUpdate.mockClear();
        mockEq.mockClear();
        // Cadena como la real: insert/update → select → single (el repositorio
        // devuelve {error} y el procesador ahora lanza si lo hay)
        const done = { single: () => Promise.resolve({ data: {}, error: null }) };
        vi.spyOn(supabase, 'from').mockReturnValue({
            insert: (...args: unknown[]) => { mockInsert(...args); return { select: () => done }; },
            update: (...args: unknown[]) => {
                mockUpdate(...args);
                return {
                    eq: (...eqArgs: unknown[]) => {
                        mockEq(...eqArgs);
                        return { select: () => done };
                    },
                };
            },
        } as never);
    });

    // ═══════════════════════════════════════════
    // R9-Fix4: $0.00 hourly_rate must NOT be skipped
    // ═══════════════════════════════════════════
    describe('R9-Fix4: $0 hourly_rate handled correctly', () => {
        it('includes hourly_rate: 0 in update (not skipped as falsy)', async () => {
            await processContract({
                action: 'update',
                contractId: 'c-001',
                hourly_rate: 0,
            });

            // The update call should include hourly_rate: 0
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ hourly_rate: 0 })
            );
        });

        it('includes empty string status in update (not skipped as falsy)', async () => {
            await processContract({
                action: 'update',
                contractId: 'c-002',
                status: '',
            });

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: '' })
            );
        });

        it('does NOT include fields that are truly undefined', async () => {
            await processContract({
                action: 'update',
                contractId: 'c-003',
                hourly_rate: 25.00,
                // status, end_date, notes are all undefined
            });

            const updateArg = mockUpdate.mock.calls[0][0];
            expect(updateArg).toHaveProperty('hourly_rate', 25.00);
            expect(updateArg).not.toHaveProperty('status');
            expect(updateArg).not.toHaveProperty('end_date');
            expect(updateArg).not.toHaveProperty('notes');
        });

        it('handles all fields being set to zero/empty simultaneously', async () => {
            await processContract({
                action: 'update',
                contractId: 'c-004',
                hourly_rate: 0,
                status: '',
                end_date: '',
                notes: '',
            });

            const updateArg = mockUpdate.mock.calls[0][0];
            expect(updateArg).toEqual({
                hourly_rate: 0,
                status: '',
                end_date: '',
                notes: '',
            });
        });
    });

    // ═══════════════════════════════════════════
    // Create contract
    // ═══════════════════════════════════════════
    describe('create contract', () => {
        it('inserts new contract with required fields', async () => {
            await processContract({
                action: 'create',
                employee_id: 'emp-1',
                orchard_id: 'o-1',
                type: 'seasonal',
                start_date: '2026-03-01',
                hourly_rate: 23.95,
            });

            expect(mockInsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    employee_id: 'emp-1',
                    orchard_id: 'o-1',
                    type: 'seasonal',
                    hourly_rate: 23.95,
                })
            );
        });
    });
});
