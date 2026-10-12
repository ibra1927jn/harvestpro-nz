/**
 * transport.processor.test.ts — Unit tests
 *
 * Uses vi.spyOn on actual services for processTransport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transportRequestRepo } from '@/repositories/index';

import { processTransport } from './transport.processor';

describe('processTransport', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('create action', () => {
        it('creates transport request via repository', async () => {
            const createSpy = vi.spyOn(transportRequestRepo, 'create')
                .mockResolvedValue({ data: null, error: null } as never);

            await processTransport({
                action: 'create',
                orchard_id: 'o-1',
                requested_by: 'user-1',
                requester_name: 'John',
                zone: 'Zone A',
                bins_count: 5,
                priority: 'high',
                notes: 'Urgent pickup',
            });

            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    orchard_id: 'o-1',
                    zone: 'Zone A',
                    bins_count: 5,
                    priority: 'high',
                })
            );
        });

        it('defaults requester_name to "Unknown"', async () => {
            const createSpy = vi.spyOn(transportRequestRepo, 'create')
                .mockResolvedValue({ data: null, error: null } as never);

            await processTransport({
                action: 'create',
                orchard_id: 'o-1',
                requested_by: 'user-1',
                zone: 'Zone B',
            });

            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({ requester_name: 'Unknown' })
            );
        });
    });

    describe('assign action', () => {
        it('uses optimistic lock when expectedUpdatedAt present', async () => {
            const lockSpy = vi.spyOn(
                await import('../optimistic-lock.service'),
                'withOptimisticLock'
            ).mockResolvedValue({ success: true } as never);

            await processTransport(
                {
                    action: 'assign',
                    requestId: 'req-1',
                    vehicleId: 'v-1',
                    assignedBy: 'mgr-1',
                },
                '2026-03-04T10:00:00Z'
            );

            expect(lockSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    table: 'transport_requests',
                    recordId: 'req-1',
                    updates: expect.objectContaining({
                        assigned_vehicle: 'v-1',
                        status: 'assigned',
                    }),
                })
            );
        });

        it('uses repository when no expectedUpdatedAt', async () => {
            const updateSpy = vi.spyOn(transportRequestRepo, 'update')
                .mockResolvedValue({ data: null, error: null } as never);

            await processTransport({
                action: 'assign',
                requestId: 'req-2',
                vehicleId: 'v-2',
                assignedBy: 'mgr-2',
            });

            expect(updateSpy).toHaveBeenCalledWith('req-2', expect.objectContaining({
                assigned_vehicle: 'v-2',
                status: 'assigned',
            }));
        });

        it('throws on optimistic lock conflict', async () => {
            vi.spyOn(
                await import('../optimistic-lock.service'),
                'withOptimisticLock'
            ).mockResolvedValue({ success: false } as never);

            await expect(
                processTransport(
                    { action: 'assign', requestId: 'req-3', vehicleId: 'v-3', assignedBy: 'mgr-3' },
                    '2026-03-04T10:00:00Z'
                )
            ).rejects.toThrow('Optimistic lock conflict');
        });
    });

    describe('complete action', () => {
        it('uses optimistic lock with completed_at timestamp', async () => {
            const lockSpy = vi.spyOn(
                await import('../optimistic-lock.service'),
                'withOptimisticLock'
            ).mockResolvedValue({ success: true } as never);

            await processTransport(
                { action: 'complete', requestId: 'req-4' },
                '2026-03-04T11:00:00Z'
            );

            expect(lockSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    table: 'transport_requests',
                    recordId: 'req-4',
                    updates: expect.objectContaining({
                        status: 'completed',
                    }),
                })
            );
        });

        it('uses repository when no expectedUpdatedAt', async () => {
            const updateSpy = vi.spyOn(transportRequestRepo, 'update')
                .mockResolvedValue({ data: null, error: null } as never);

            await processTransport({ action: 'complete', requestId: 'req-5' });

            expect(updateSpy).toHaveBeenCalledWith('req-5', expect.objectContaining({
                status: 'completed',
            }));
        });
    });

    describe('cancel action', () => {
        it('marks the request cancelled (not completed) and sets no end time', async () => {
            const updateSpy = vi.spyOn(transportRequestRepo, 'update')
                .mockResolvedValue({ data: null, error: null } as never);

            await processTransport({ action: 'cancel', requestId: 'req-6' });

            expect(updateSpy).toHaveBeenCalledWith('req-6', { status: 'cancelled' });
        });
    });

    describe('failed writes', () => {
        it('throws when the create fails so the queue retries it', async () => {
            vi.spyOn(transportRequestRepo, 'create')
                .mockResolvedValue({ data: null, error: 'invalid input syntax for type uuid' } as never);

            await expect(processTransport({
                action: 'create', orchard_id: 'o1', requested_by: 'u1', zone: 'Row 3',
            })).rejects.toThrow(/not saved/);
        });

        it('throws when an update fails', async () => {
            vi.spyOn(transportRequestRepo, 'update')
                .mockResolvedValue({ data: null, error: 'permission denied' } as never);

            await expect(processTransport({ action: 'assign', requestId: 'r1', vehicleId: 'v1', assignedBy: 'u1' }))
                .rejects.toThrow(/not updated/);
        });
    });
});
