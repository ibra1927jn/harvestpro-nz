/**
 * fraud-detection.service — bridge a edge function detect-anomalies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { anomalyDismissalsRepository } from '@/repositories/anomaly-dismissals.repository';
import { anomalyKey, fraudDetectionService } from './fraud-detection.service';

beforeEach(() => vi.restoreAllMocks());

describe('fraudDetectionService.fetchAnomalies', () => {
    const validResponse = {
        anomalies: [
            {
                id: 'a1',
                type: 'peer_outlier',
                severity: 'high',
                pickerId: 'p1',
                pickerName: 'Alice',
                detail: '3x peer avg',
                timestamp: '2026-04-18T09:00:00Z',
                evidence: { rate: 120 },
                rule: 'peer_comparison',
            },
        ],
        stats: { total: 1, high: 1, medium: 0, low: 0 },
    };

    it('devuelve anomalies parseadas por Zod', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: validResponse,
            error: null,
        });
        const anomalies = await fraudDetectionService.fetchAnomalies('o1');
        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].id).toBe('a1');
    });

    it('[] cuando edge function devuelve error', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: { message: 'rls' },
        });
        expect(await fraudDetectionService.fetchAnomalies('o1')).toEqual([]);
    });

    it('[] cuando invoke throws (network)', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockRejectedValue(new Error('net'));
        expect(await fraudDetectionService.fetchAnomalies('o1')).toEqual([]);
    });

    it('[] cuando data no pasa schema (fallback safe)', async () => {
        vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: { garbage: true },
            error: null,
        });
        expect(await fraudDetectionService.fetchAnomalies('o1')).toEqual([]);
    });

    it('pasa orchard_id a la edge function', async () => {
        const spy = vi
            .spyOn(edgeFunctionsRepository, 'invoke')
            .mockResolvedValue({ data: validResponse, error: null });
        await fraudDetectionService.fetchAnomalies('orchard-xyz');
        expect(spy).toHaveBeenCalledWith('detect-anomalies', { orchard_id: 'orchard-xyz' });
    });
});

describe('fraudDetectionService dismissals (anomaly_dismissals)', () => {
    const anomaly = {
        id: 'anm-1-1', type: 'peer_outlier' as const, severity: 'medium' as const,
        pickerId: '11111111-1111-4111-8111-111111111111', pickerName: 'Ana', detail: '2x row mates',
        timestamp: '2026-10-23T01:00:00Z', evidence: {}, rule: 'peer_comparison' as const,
    };

    it('the key survives new ids from detect-anomalies', () => {
        expect(anomalyKey(anomaly)).toBe(anomalyKey({ ...anomaly, id: 'anm-9-9' } as typeof anomaly));
        expect(anomalyKey(anomaly)).toBe('peer_outlier|11111111-1111-4111-8111-111111111111|2026-10-23T01:00:00Z');
    });

    it('dismissing saves the anomaly with its reason', async () => {
        const insert = vi.spyOn(anomalyDismissalsRepository, 'insert').mockResolvedValue({ id: 'd1' } as never);
        await fraudDetectionService.dismissAnomaly('o1', anomaly, '  good trees ');
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            orchard_id: 'o1', anomaly_key: anomalyKey(anomaly), anomaly_type: 'peer_outlier',
            picker_id: anomaly.pickerId, picker_name: 'Ana', reason: 'good trees',
        }));
    });

    it('listing dismissals offline returns an empty list instead of failing', async () => {
        vi.spyOn(anomalyDismissalsRepository, 'listSince').mockRejectedValue(new Error('offline'));
        expect(await fraudDetectionService.listDismissals('o1', '2026-10-22T11:00:00Z')).toEqual([]);
    });
});
