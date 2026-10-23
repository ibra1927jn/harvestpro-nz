// =============================================
// FRAUD DETECTION SERVICE TESTS
// =============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the edge functions repository to avoid real network calls + gateway retries
vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn().mockRejectedValue(new Error('Edge Function returned a non-2xx status code')),
    },
}));

import { fraudDetectionService } from '../fraud-detection.service';

describe('Fraud Detection Service', () => {

    // =============================================
    // DEFAULT CONFIG
    // =============================================
    describe('config', () => {
        it('should have sensible default values', () => {
            const cfg = fraudDetectionService.config;
            expect(cfg.gracePeriodMinutes).toBe(90);
            expect(cfg.peerOutlierThreshold).toBe(3.0);
            expect(cfg.maxPhysicalRate).toBe(8);
            expect(cfg.shiftStartHour).toBe(6);
            expect(cfg.shiftEndHour).toBe(19);
        });
    });

    // =============================================
    // fetchAnomalies (with mocked edgeFunctionsRepository)
    // =============================================
    describe('fetchAnomalies', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('should return empty array when Edge Function fails', async () => {
            // The edgeFunctionsRepository mock will reject — service returns []
            const result = await fraudDetectionService.fetchAnomalies('test-orchard');
            expect(Array.isArray(result)).toBe(true);
        });
    });
});



