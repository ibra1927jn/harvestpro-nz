/**
 * Descartar una anomalía la guarda (anomaly_dismissals), la quita de la lista
 * y suma al contador «Dismissed» real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const fetchAnomalies = vi.fn();
const listDismissals = vi.fn();
const dismissAnomaly = vi.fn();
vi.mock('../../../services/fraud-detection.service', async (orig) => ({
    ...(await orig<typeof import('@/services/fraud-detection.service')>()),
    fraudDetectionService: {
        fetchAnomalies: (...a: unknown[]) => fetchAnomalies(...a),
        listDismissals: (...a: unknown[]) => listDismissals(...a),
        dismissAnomaly: (...a: unknown[]) => dismissAnomaly(...a),
        undoDismissal: vi.fn(),
    },
}));

import AnomalyDetectionView from './AnomalyDetectionView';
import { useHarvestStore } from '@/stores/useHarvestStore';

const anomaly = (id: string, pickerName: string, ts: string) => ({
    id, type: 'peer_outlier', severity: 'high', pickerId: `p-${pickerName}`, pickerName, detail: 'fast',
    timestamp: ts, evidence: {}, rule: 'peer_comparison',
});

beforeEach(() => {
    act(() => useHarvestStore.setState({ orchard: { id: 'o1', name: 'A' } }));
    fetchAnomalies.mockResolvedValue([anomaly('a1', 'Ana', '2026-10-23T01:00:00Z'), anomaly('a2', 'Ben', '2026-10-23T02:00:00Z')]);
    listDismissals.mockResolvedValue([{ id: 'd0', anomaly_key: 'peer_outlier|p-Ben|2026-10-23T02:00:00Z', anomaly_type: 'peer_outlier', picker_name: 'Ben', reason: 'ok', detail: null, anomaly_at: null, orchard_id: 'o1', picker_id: null, dismissed_by: 'm', dismissed_at: '2026-10-23T03:00:00Z' }]);
    dismissAnomaly.mockReset();
});

describe('AnomalyDetectionView dismissals', () => {
    it('hides anomalies already dismissed and counts the real dismissals', async () => {
        render(<AnomalyDetectionView />);
        expect(await screen.findByText('Ana')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Dismiss Ben/ })).toBeNull();
        expect(listDismissals).toHaveBeenCalledWith('o1', expect.any(String));
    });

    it('dismissing saves it with the reason and removes it from the list', async () => {
        dismissAnomaly.mockImplementation(async (_o: string, a: { pickerName: string; type: string; pickerId: string; timestamp: string }, reason: string) => ({
            id: 'd1', anomaly_key: `${a.type}|${a.pickerId}|${a.timestamp}`, anomaly_type: a.type, picker_name: a.pickerName, reason,
            detail: null, anomaly_at: a.timestamp, orchard_id: 'o1', picker_id: null, dismissed_by: 'm', dismissed_at: '2026-10-23T04:00:00Z',
        }));
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('heavy trees');
        render(<AnomalyDetectionView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Ana as a false alarm' }));
        await waitFor(() => expect(dismissAnomaly).toHaveBeenCalledWith('o1', expect.objectContaining({ pickerName: 'Ana' }), 'heavy trees'));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Dismiss Ana as a false alarm' })).toBeNull());
        prompt.mockRestore();
    });

    it('cancelling the prompt dismisses nothing', async () => {
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
        render(<AnomalyDetectionView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Ana as a false alarm' }));
        expect(dismissAnomaly).not.toHaveBeenCalled();
        prompt.mockRestore();
    });
});
