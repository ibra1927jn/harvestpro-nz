/**
 * Avisos de calidad en la campana: el team leader ve el rechazo de su equipo
 * (nombre, nota, criterio) y tocarlo abre el cajón del picker.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: { id: 'tl1', role: 'team_leader' } as { id: string; role: string } }));
// Referencias estables (un array nuevo en cada render re-dispara el efecto del panel sin fin)
const messaging = vi.hoisted(() => ({ broadcasts: [], messages: [], unreadCount: 0, acknowledgeBroadcast: () => undefined }));

vi.mock('@/services/supabase', () => ({
    supabase: { auth: { getSession: vi.fn() }, from: vi.fn(), channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }), removeChannel: vi.fn(), getChannels: vi.fn(() => []) },
}));
vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => messaging,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: auth.user }) }));

import NotificationPanel from './NotificationPanel';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { __resetQcTodayCache } from '@/hooks/useQcAlerts';

const now = new Date().toISOString();

describe('NotificationPanel — QC alerts', () => {
    beforeEach(() => {
        __resetQcTodayCache();
        localStorage.clear();
        useHarvestStore.setState({
            orchard: null,
            pickerProfileId: null,
            crew: [
                { id: 'p1', name: 'Aroha Walker', team_leader_id: 'tl1' },
                { id: 'p2', name: 'Rua Hall', team_leader_id: 'tl2' },
            ] as never,
            recentQcInspections: [
                { id: 'q1', picker_id: 'p1', grade: 'reject', criteria: { ladder: 'bad' }, created_at: now },
                { id: 'q2', picker_id: 'p2', grade: 'reject', criteria: null, created_at: now },
                { id: 'q3', picker_id: 'p1', grade: 'A', criteria: { size: 'ok' }, created_at: now },
            ],
        });
    });

    it('team leader sees only his team reject with grade and failed criterion; tapping opens the drawer', () => {
        auth.user = { id: 'tl1', role: 'team_leader' };
        const onClose = vi.fn();
        render(<NotificationPanel onClose={onClose} />);
        expect(screen.getByText('Quality alert: Aroha Walker')).toBeTruthy();
        expect(screen.queryByText('Quality alert: Rua Hall')).toBeNull();
        expect(screen.getByTestId('qc-alert-q1').textContent).toMatch(/Failed: Ladder use/);
        fireEvent.click(screen.getByTestId('qc-alert-q1'));
        expect(useHarvestStore.getState().pickerProfileId).toBe('p1');
        expect(onClose).toHaveBeenCalled();
        expect(localStorage.getItem('harvestpro_qc_alerts_seen_tl1')).toContain('q1');
    });

    it('manager sees every alert of the orchard', () => {
        auth.user = { id: 'm1', role: 'manager' };
        render(<NotificationPanel onClose={vi.fn()} />);
        expect(screen.getByText('Quality alert: Aroha Walker')).toBeTruthy();
        expect(screen.getByText('Quality alert: Rua Hall')).toBeTruthy();
    });

    it('QC inspectors get no quality alerts', () => {
        auth.user = { id: 'qc1', role: 'qc_inspector' };
        render(<NotificationPanel onClose={vi.fn()} />);
        expect(screen.queryByText(/Quality alert/)).toBeNull();
    });
});
