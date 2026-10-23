import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const fetchGlobalData = vi.fn().mockResolvedValue(undefined);
const { setState } = vi.hoisted(() => ({ setState: vi.fn() }));
let appUser: { id: string; orchard_id?: string; full_name?: string; role?: string } | null = null;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser }) }));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: Object.assign((selector: (s: unknown) => unknown) => selector({ fetchGlobalData }), { setState }),
}));

import { OrchardDataBootstrap } from './OrchardDataBootstrap';

describe('OrchardDataBootstrap', () => {
    beforeEach(() => { fetchGlobalData.mockClear(); appUser = null; });

    it('carga el huerto asignado al usuario (cualquier rol)', () => {
        appUser = { id: 'payroll-1', orchard_id: 'orch-A', full_name: 'Pay', role: 'payroll_admin' };
        render(<OrchardDataBootstrap />);
        expect(fetchGlobalData).toHaveBeenCalledWith('orch-A');
        // El rol decide de dónde sale la presencia (fichajes o presence_today)
        expect(setState).toHaveBeenCalledWith({ currentUser: { id: 'payroll-1', name: 'Pay', role: 'payroll_admin' } });
    });

    it('no carga sin usuario y no repite la carga al volver a renderizar', () => {
        const { rerender } = render(<OrchardDataBootstrap />);
        expect(fetchGlobalData).not.toHaveBeenCalled();
        appUser = { id: 'u1', orchard_id: 'orch-A' };
        rerender(<OrchardDataBootstrap />);
        rerender(<OrchardDataBootstrap />);
        expect(fetchGlobalData).toHaveBeenCalledTimes(1);
    });

    it('vuelve a cargar si cambia el huerto del usuario', () => {
        appUser = { id: 'u1', orchard_id: 'orch-A' };
        const { rerender } = render(<OrchardDataBootstrap />);
        appUser = { id: 'u1', orchard_id: 'orch-B' };
        rerender(<OrchardDataBootstrap />);
        expect(fetchGlobalData).toHaveBeenLastCalledWith('orch-B');
    });
});
