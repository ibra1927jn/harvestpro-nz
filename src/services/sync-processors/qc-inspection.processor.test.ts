/**
 * qc-inspection.processor — sync queue handler para QC_INSPECTION payloads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qcRepository } from '@/repositories/qc.repository';
import { processQCInspection } from './qc-inspection.processor';

beforeEach(() => vi.restoreAllMocks());

describe('processQCInspection', () => {
    const base = {
        orchard_id: 'o1',
        picker_id: 'p1',
        inspector_id: 'i1',
        grade: 'A' as const,
        notes: 'test note',
        photo_url: 'https://cdn/foo.jpg',
    };

    it('inserta payload mapeado al repo (campos nuevos a null si no vienen)', async () => {
        const insertSpy = vi
            .spyOn(qcRepository, 'insert')
            .mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
        await processQCInspection(base);
        expect(insertSpy).toHaveBeenCalledWith({
            orchard_id: 'o1',
            picker_id: 'p1',
            inspector_id: 'i1',
            grade: 'A',
            notes: 'test note',
            photo_url: 'https://cdn/foo.jpg',
            criteria: null,
            score: null,
            row_number: null,
            informed: null,
            comfortable: null,
            wellbeing_notes: null,
        });
    });

    it('pasa criterios, puntuación, fila y bienestar tal cual', async () => {
        const insertSpy = vi
            .spyOn(qcRepository, 'insert')
            .mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
        await processQCInspection({
            ...base,
            grade: 'C',
            criteria: { ladder: 'ok', size: 'warn', damaged_fruit: 'bad' },
            score: 50,
            row_number: 14,
            informed: false,
            comfortable: true,
            wellbeing_notes: 'needs a briefing',
        });
        const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.criteria).toEqual({ ladder: 'ok', size: 'warn', damaged_fruit: 'bad' });
        expect(payload.score).toBe(50);
        expect(payload.row_number).toBe(14);
        expect(payload.informed).toBe(false);
        expect(payload.comfortable).toBe(true);
        expect(payload.wellbeing_notes).toBe('needs a briefing');
    });

    // La validación del payload (puntuación fuera de rango, estado de criterio
    // desconocido, nota inválida) la hace el despachador de la cola con
    // QCInspectionPayloadSchema: ver src/services/sync-queue/sync-queue.test.ts.

    it('notes y photo_url → null cuando undefined', async () => {
        const insertSpy = vi
            .spyOn(qcRepository, 'insert')
            .mockResolvedValue({ data: { id: 'q1' }, error: null } as never);
        await processQCInspection({ ...base, notes: undefined, photo_url: undefined } as never);
        const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.notes).toBeNull();
        expect(payload.photo_url).toBeNull();
    });

    it('throws con mensaje incluido cuando repo devuelve error', async () => {
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({
            data: null,
            error: { message: 'rls denied' },
        } as never);
        await expect(processQCInspection(base)).rejects.toThrow(/rls denied/);
    });
});
