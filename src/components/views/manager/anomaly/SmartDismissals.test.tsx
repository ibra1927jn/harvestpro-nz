/**
 * SmartDismissals — descartes reales (anomaly_dismissals), no una lista fija.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartDismissals from './SmartDismissals';
import type { AnomalyDismissalRow } from '@/services/fraud-detection.service';

const row = (over: Partial<AnomalyDismissalRow>): AnomalyDismissalRow => ({
    id: 'd1', orchard_id: 'o1', anomaly_key: 'k', anomaly_type: 'peer_outlier', picker_id: null, picker_name: 'Ana',
    detail: '2x row mates', anomaly_at: '2026-10-23T01:00:00Z', reason: 'good trees', dismissed_by: 'm', dismissed_at: '2026-10-23T02:00:00Z', ...over,
});

describe('SmartDismissals', () => {
    it('counts the real dismissals', () => {
        render(<SmartDismissals dismissed={[row({}), row({ id: 'd2', reason: null })]} />);
        expect(screen.getByText('Dismissed today')).toBeTruthy();
        expect(screen.getByText(/2 anomalies dismissed/)).toBeTruthy();
    });

    it('shows each one with its reason after expanding, and can undo', () => {
        const onUndo = vi.fn();
        render(<SmartDismissals dismissed={[row({}), row({ id: 'd2', reason: null, picker_name: 'Ben' })]} onUndo={onUndo} />);
        expect(screen.queryByText('2x row mates')).toBeNull();
        fireEvent.click(screen.getByText('Dismissed today'));
        expect(screen.getByText(/good trees/)).toBeTruthy();
        expect(screen.getByText(/No reason given/)).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(onUndo).toHaveBeenCalledWith('d1');
    });

    it('says when nothing was dismissed', () => {
        render(<SmartDismissals dismissed={[]} />);
        fireEvent.click(screen.getByText('Dismissed today'));
        expect(screen.getByText(/Nothing dismissed today/)).toBeTruthy();
    });
});
