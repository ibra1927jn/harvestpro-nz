/**
 * useSettings — Guardar ajustes (auditoría 23-10):
 *  - B5: no escribe la variedad («Cherry» por defecto en huertos de manzanas)
 *  - A4: no escribe piece_rate (el precio de hoy va en piece_rates, por día)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const updateHarvestSettings = vi.fn();
vi.mock('@/services/settings.service', () => ({
    settingsService: {
        updateHarvestSettings: (...a: unknown[]) => updateHarvestSettings(...a),
        getHarvestSettings: vi.fn().mockResolvedValue(null),
    },
}));

import { supabase } from '@/services/supabase';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useSettings } from './useSettings';

function orchardsQuery() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'order']) q[m] = vi.fn(() => q);
    q.then = (ok?: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
}

describe('useSettings — handleSave', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        updateHarvestSettings.mockReset().mockResolvedValue({ ok: true });
        vi.spyOn(supabase, 'from').mockReturnValue(orchardsQuery() as never);
        act(() => {
            useHarvestStore.setState(s => ({
                orchard: { id: 'o1', name: 'Apples' },
                currentUser: { id: 'u1', name: 'M', role: 'manager' } as never,
                settings: { ...s.settings, piece_rate: 7.25, min_wage_rate: 23.95, min_buckets_per_hour: 4, target_tons: 40, variety: undefined },
            }));
        });
    });

    it('sin variedad guardada el formulario no inventa «Cherry»', () => {
        const { result } = renderHook(() => useSettings());
        expect(result.current.formData.variety).toBe('');
        expect(result.current.formData.piece_rate).toBe(7.25);
    });

    it('guardar no escribe variety ni piece_rate', async () => {
        const { result } = renderHook(() => useSettings());
        act(() => result.current.handleChange('target_tons', 50));
        await act(async () => { await result.current.handleSave(); });
        expect(updateHarvestSettings).toHaveBeenCalledTimes(1);
        const payload = updateHarvestSettings.mock.calls[0][1] as Record<string, unknown>;
        expect(payload).not.toHaveProperty('variety');
        expect(payload).not.toHaveProperty('piece_rate');
        expect(payload).toMatchObject({ target_tons: 50, min_wage_rate: 23.95 });
        expect(useHarvestStore.getState().settings.variety).toBeUndefined();
    });

    it('setGeneralRate (precio de hoy del editor) no marca cambios y recalcula el mínimo de cubetas/hora', () => {
        const { result } = renderHook(() => useSettings());
        act(() => result.current.setGeneralRate(4));
        expect(result.current.formData.piece_rate).toBe(4);
        expect(result.current.complianceFloor).toBe(6); // ceil(23.95 / 4)
        expect(result.current.formData.min_buckets_per_hour).toBe(6);
        expect(result.current.hasChanges).toBe(false);
    });
});
