/** El aviso del manager deja elegir destinatarios; por defecto, todos */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendBroadcast = vi.hoisted(() => vi.fn());
vi.mock('@/context/MessagingContext', () => ({ useMessaging: () => ({ sendBroadcast }) }));

import BroadcastModal from './BroadcastModal';

beforeEach(() => { sendBroadcast.mockReset(); sendBroadcast.mockResolvedValue(true); });

describe('BroadcastModal (manager) — recipients', () => {
    it('sends to everyone by default', async () => {
        render(<BroadcastModal onClose={vi.fn()} />);
        const [input, textarea] = screen.getAllByRole('textbox');
        fireEvent.change(input, { target: { value: 'Rain' } });
        fireEvent.change(textarea, { target: { value: 'Stop picking' } });
        expect(screen.getByRole('button', { name: 'Everyone' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: /Send/ }));
        await waitFor(() => expect(sendBroadcast).toHaveBeenCalledWith('Rain', 'Stop picking', 'normal', []));
    });

    it('sends only to QC and office when chosen', async () => {
        render(<BroadcastModal onClose={vi.fn()} />);
        const [input, textarea] = screen.getAllByRole('textbox');
        fireEvent.change(input, { target: { value: 'Audit' } });
        fireEvent.change(textarea, { target: { value: 'Tomorrow 8am' } });
        fireEvent.click(screen.getByRole('button', { name: 'QC' }));
        fireEvent.click(screen.getByRole('button', { name: 'Office' }));
        expect(screen.getByRole('button', { name: 'Everyone' }).getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(screen.getByRole('button', { name: /Send/ }));
        await waitFor(() => expect(sendBroadcast).toHaveBeenCalled());
        expect([...sendBroadcast.mock.calls[0][3]].sort()).toEqual(['hr_admin', 'logistics', 'payroll_admin', 'qc_inspector']);
    });
});
