/**
 * qc.service — tests sobre logInspection + getInspections + grade dist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qcRepository } from '@/repositories/qc.repository';
import { syncService } from './sync.service';
import { logger } from '@/utils/logger';
import { qcService } from './qc.service';

beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('qcService.logInspection', () => {
    const baseParams = {
        orchardId: 'o1',
        pickerId: 'p1',
        inspectorId: 'i1',
        grade: 'A' as const,
    };

    it('devuelve data cuando inserción OK', async () => {
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({
            data: { id: 'q1', grade: 'A' },
            error: null,
        } as never);
        const res = await qcService.logInspection(baseParams);
        expect((res as { id: string })?.id).toBe('q1');
    });

    it('normaliza notes y photoUrl a null cuando undefined', async () => {
        const spy = vi
            .spyOn(qcRepository, 'insert')
            .mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
        await qcService.logInspection(baseParams);
        const payload = spy.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.notes).toBeNull();
        expect(payload.photo_url).toBeNull();
    });

    it('con foto pendiente (sin cobertura) va directo a la cola con su id, la foto y la ruta', async () => {
        const insert = vi.spyOn(qcRepository, 'insert');
        const queue = vi.spyOn(syncService, 'addToQueue').mockResolvedValue('q');
        const id = '0f5e2c1a-1111-4222-8333-944455556666';
        const res = await qcService.logInspection({
            ...baseParams, id, pendingPhoto: { fileId: id, path: `o1/2026-10-23/${id}.webp` },
        });
        expect(insert).not.toHaveBeenCalled();
        expect(queue).toHaveBeenCalledWith('QC_INSPECTION', expect.objectContaining({
            id, photo_file_id: id, photo_path: `o1/2026-10-23/${id}.webp`, photo_url: null,
        }));
        expect(res?.id).toBe(id);
    });

    it('el id del móvil va en el insert y en la cola si no hay red', async () => {
        const id = '0f5e2c1a-1111-4222-8333-944455556666';
        const insert = vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } } as never);
        const queue = vi.spyOn(syncService, 'addToQueue').mockResolvedValue('q');
        const res = await qcService.logInspection({ ...baseParams, id });
        expect(insert.mock.calls[0][0]).toMatchObject({ id });
        expect(queue).toHaveBeenCalledWith('QC_INSPECTION', expect.objectContaining({ id }));
        expect(res?.id).toBe(id);
    });

    it('queue a sync cuando error es "Failed to fetch"', async () => {
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch' },
        } as never);
        const queueSpy = vi.spyOn(syncService, 'addToQueue').mockResolvedValue(undefined as never);

        const res = await qcService.logInspection(baseParams);
        expect(queueSpy).toHaveBeenCalled();
        expect((res as { id: string })?.id).toMatch(/^pending-/);
    });

    it('queue a sync cuando navigator.onLine es false', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({
            data: null,
            error: { message: 'anything' },
        } as never);
        const queueSpy = vi.spyOn(syncService, 'addToQueue').mockResolvedValue(undefined as never);

        await qcService.logInspection(baseParams);
        expect(queueSpy).toHaveBeenCalled();
    });

    it('devuelve null en otro error (e.g. RLS), loguea', async () => {
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({
            data: null,
            error: { message: 'RLS denied' },
        } as never);
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const res = await qcService.logInspection(baseParams);
        expect(res).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });
});

describe('qcService.getInspections', () => {
    it('devuelve array cuando repo OK', async () => {
        vi.spyOn(qcRepository, 'getByOrchardAndDateRange').mockResolvedValue([
            { id: 'q1', grade: 'A' },
            { id: 'q2', grade: 'B' },
        ] as never);
        const res = await qcService.getInspections('o1', '2026-04-18');
        expect(res).toHaveLength(2);
    });

    it('devuelve [] cuando repo throws', async () => {
        vi.spyOn(qcRepository, 'getByOrchardAndDateRange').mockRejectedValue(new Error('db'));
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        expect(await qcService.getInspections('o1', '2026-04-18')).toEqual([]);
    });
});

describe('qcService.getGradeDistribution', () => {
    it('cuenta grades A/B/C/reject + total', async () => {
        vi.spyOn(qcRepository, 'getByOrchardAndDateRange').mockResolvedValue([
            { grade: 'A' },
            { grade: 'A' },
            { grade: 'B' },
            { grade: 'reject' },
        ] as never);
        const dist = await qcService.getGradeDistribution('o1', '2026-04-18');
        expect(dist).toEqual({ A: 2, B: 1, C: 0, reject: 1, total: 4 });
    });

    it('distribución zero-fill cuando no hay inspecciones', async () => {
        vi.spyOn(qcRepository, 'getByOrchardAndDateRange').mockResolvedValue([] as never);
        expect(await qcService.getGradeDistribution('o1', '2026-04-18')).toEqual({
            A: 0, B: 0, C: 0, reject: 0, total: 0,
        });
    });

    it('ignora grades desconocidos pero aún suma total', async () => {
        vi.spyOn(qcRepository, 'getByOrchardAndDateRange').mockResolvedValue([
            { grade: 'A' },
            { grade: 'D' as never },
        ] as never);
        const dist = await qcService.getGradeDistribution('o1', '2026-04-18');
        expect(dist.A).toBe(1);
        expect(dist.total).toBe(2);
    });
});

describe('qcService.getPickerInspections', () => {
    it('devuelve array con default limit 20', async () => {
        const spy = vi.spyOn(qcRepository, 'getByPicker').mockResolvedValue([
            { id: 'q1' },
        ] as never);
        await qcService.getPickerInspections('p1');
        expect(spy).toHaveBeenCalledWith('p1', 20);
    });

    it('respeta limit custom', async () => {
        const spy = vi.spyOn(qcRepository, 'getByPicker').mockResolvedValue([] as never);
        await qcService.getPickerInspections('p1', 5);
        expect(spy).toHaveBeenCalledWith('p1', 5);
    });

    it('devuelve [] cuando repo throws', async () => {
        vi.spyOn(qcRepository, 'getByPicker').mockRejectedValue(new Error('fail'));
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        expect(await qcService.getPickerInspections('p1')).toEqual([]);
    });
});
