/**
 * bucket-ledger.service — wrapper thin sobre edgeFunctions + repo read.
 * Usa vi.spyOn sobre los módulos en lugar de vi.mock (más fiable en esta
 * codebase — ver settings.repository.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bucketLedgerService } from './bucket-ledger.service';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { bucketLedgerRepository } from '@/repositories/bucket-ledger.repository';
import { logger } from '@/utils/logger';

const baseEvent = {
    picker_id: 'p1',
    orchard_id: 'o1',
    row_number: 3,
    quality_grade: 'A' as const,
    bin_id: 'b1',
    scanned_by: 'tl1',
    scanned_at: '2026-04-18T09:00:00Z',
};

describe('bucketLedgerService.recordBucket', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('llama edge function record-bucket con los campos del event', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: { id: 'rec-1', picker_id: 'p1', scanned_at: baseEvent.scanned_at, resolved_from_badge: false },
            error: null,
        });

        const result = await bucketLedgerService.recordBucket(baseEvent);
        expect(invokeSpy).toHaveBeenCalledWith('record-bucket', {
            picker_id: 'p1',
            orchard_id: 'o1',
            row_number: 3,
            quality_grade: 'A',
            bin_id: 'b1',
            scanned_by: 'tl1',
            scanned_at: baseEvent.scanned_at,
            // Hora del móvil al enviar: el servidor mide el desfase y corrige
            client_now: expect.any(Number),
        });
        expect((result as { id: string })?.id).toBe('rec-1');
    });

    it('throws y loguea cuando edge function devuelve error', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: { message: 'badge spoof' },
        });
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

        await expect(bucketLedgerService.recordBucket(baseEvent)).rejects.toThrow('badge spoof');
        expect(errorSpy).toHaveBeenCalled();
    });

    it('re-throws cuando invoke tira exception', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockRejectedValue(new Error('network'));
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        await expect(bucketLedgerService.recordBucket(baseEvent)).rejects.toThrow('network');
    });
});

describe('bucketLedgerService.getPickerHistory', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('delega en repo sin transformar', async () => {
        const historySpy = vi.spyOn(bucketLedgerRepository, 'getPickerHistory').mockResolvedValue([
            { id: 'x1' },
            { id: 'x2' },
        ] as never);
        const result = await bucketLedgerService.getPickerHistory('p1');
        expect(historySpy).toHaveBeenCalledWith('p1');
        expect(result).toHaveLength(2);
    });
});
