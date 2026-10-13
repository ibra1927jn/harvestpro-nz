/**
 * edgeFunctionWarmup.service — ping periódico a 4 edge functions críticas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { edgeFunctionWarmupService, warmupFunctionsFor } from './edgeFunctionWarmup.service';
import { Role } from '@/types/app.types';

beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
    edgeFunctionWarmupService.stop();
    vi.useRealTimers();
});

describe('edgeFunctionWarmupService', () => {
    it('start() dispara ping inmediato a las 4 funciones críticas', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        // Dejar microtasks drenar
        await vi.advanceTimersByTimeAsync(0);

        expect(invokeSpy).toHaveBeenCalledWith('manage-attendance', { _warmup: true }, { maxRetries: 0 });
        expect(invokeSpy).toHaveBeenCalledWith('record-bucket', { _warmup: true }, { maxRetries: 0 });
        expect(invokeSpy).toHaveBeenCalledWith('calculate-payroll', { _warmup: true }, { maxRetries: 0 });
        expect(invokeSpy).toHaveBeenCalledWith('check-compliance', { _warmup: true }, { maxRetries: 0 });
        expect(invokeSpy).toHaveBeenCalledTimes(4);
    });

    it('dispara ping cada 4min tras el start inmediato', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledTimes(4);

        // Avanzar 4 min → otra ronda de 4 calls
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
        expect(invokeSpy).toHaveBeenCalledTimes(8);

        // Y otros 4 min
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
        expect(invokeSpy).toHaveBeenCalledTimes(12);
    });

    it('start() es idempotente — no spawnea intervals duplicados', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        edgeFunctionWarmupService.start(Role.MANAGER);
        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);

        // Sólo el primer start hizo pingAll inmediato
        expect(invokeSpy).toHaveBeenCalledTimes(4);
    });

    it('stop() cancela el interval', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        edgeFunctionWarmupService.stop();

        await vi.advanceTimersByTimeAsync(10 * 60 * 1000); // 10 min — no debería pingar más

        expect(invokeSpy).toHaveBeenCalledTimes(4); // Sólo el inicial
    });

    it('skip completo cuando navigator.onLine === false', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);

        expect(invokeSpy).not.toHaveBeenCalled();
    });

    it('swallowea errores del repo — siguiente ping sigue funcionando', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockRejectedValue(new Error('down'));

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledTimes(4);
        // No throws al caller
    });

    it('runner solo calienta record-bucket (el resto le devolvería 403)', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.RUNNER);
        await vi.advanceTimersByTimeAsync(0);

        expect(invokeSpy.mock.calls.map(c => c[0])).toEqual(['record-bucket']);
    });

    it('roles sin funciones críticas (QC, logística) no hacen ninguna llamada', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.QC_INSPECTOR);
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
        edgeFunctionWarmupService.start(Role.LOGISTICS);
        await vi.advanceTimersByTimeAsync(0);

        expect(invokeSpy).not.toHaveBeenCalled();
    });

    it('warmupFunctionsFor sigue los requireRole de cada función', () => {
        expect(warmupFunctionsFor(Role.TEAM_LEADER)).toEqual([
            'manage-attendance',
            'record-bucket',
            'check-compliance',
        ]);
        expect(warmupFunctionsFor(Role.PAYROLL_ADMIN)).toEqual(['calculate-payroll']);
        expect(warmupFunctionsFor(Role.HR_ADMIN)).toEqual(['calculate-payroll']);
        expect(warmupFunctionsFor(null)).toEqual([]);
    });
});
