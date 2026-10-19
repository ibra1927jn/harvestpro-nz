/**
 * edgeFunctionWarmup.service — ping periódico a 4 edge functions críticas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { edgeFunctionWarmupService, warmupFunctionsFor } from './edgeFunctionWarmup.service';
import { supabase } from '@/services/supabase';
import { Role } from '@/types/app.types';

type AalResult = Awaited<ReturnType<typeof supabase.auth.mfa.getAuthenticatorAssuranceLevel>>;
const aal = (level: 'aal1' | 'aal2') =>
    vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel')
        .mockResolvedValue({ data: { currentLevel: level, nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null } as AalResult);

beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    // Sesión ya con 2FA salvo que el test diga otra cosa
    aal('aal2');
});

afterEach(() => {
    edgeFunctionWarmupService.stop();
    vi.useRealTimers();
});

describe('edgeFunctionWarmupService', () => {
    it('a privileged role still without the 2FA code (aal1) does not ping (the server would answer 403)', async () => {
        const level = aal('aal1');
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({ data: null, error: null });

        edgeFunctionWarmupService.start(Role.PAYROLL_ADMIN);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).not.toHaveBeenCalled();

        // Ya verificó el código: el siguiente start() (cambio de sesión) sí calienta
        level.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null } as AalResult);
        edgeFunctionWarmupService.start(Role.PAYROLL_ADMIN);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledWith('calculate-payroll', { _warmup: true }, { maxRetries: 0 });
    });

    it('field roles do not need 2FA: they ping with a password-only session', async () => {
        aal('aal1');
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({ data: null, error: null });
        edgeFunctionWarmupService.start(Role.RUNNER);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledWith('record-bucket', { _warmup: true }, { maxRetries: 0 });
    });

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

    it('no repite pings con el tiempo: solo al entrar (batería)', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledTimes(4);

        // Un turno entero sin más llamadas
        await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
        expect(invokeSpy).toHaveBeenCalledTimes(4);
    });

    it('start() es idempotente en la misma sesión', async () => {
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

    it('tras stop() (logout) la siguiente sesión vuelve a calentar', async () => {
        const invokeSpy = vi.spyOn(edgeFunctionsRepository, 'invoke').mockResolvedValue({
            data: null,
            error: null,
        });

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        edgeFunctionWarmupService.stop();

        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        expect(invokeSpy).toHaveBeenCalledTimes(4);

        edgeFunctionWarmupService.start(Role.MANAGER);
        await vi.advanceTimersByTimeAsync(0);
        expect(invokeSpy).toHaveBeenCalledTimes(8);
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
