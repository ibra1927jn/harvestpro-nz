/**
 * Tests for BroadcastModal — Send broadcasts to field staff
 * @module components/modals/BroadcastModal.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
        <div data-testid="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {children}
        </div>
    ),
}));

import BroadcastModal from './BroadcastModal';

describe('BroadcastModal', () => {
    const onClose = vi.fn();
    const onSend = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders title "New Broadcast"', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        expect(screen.getByText('New Broadcast')).toBeTruthy();
    });

    it('renders title input', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        expect(screen.getByPlaceholderText(/Weather Alert/)).toBeTruthy();
    });

    it('renders message textarea', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        expect(screen.getByPlaceholderText(/broadcast message/)).toBeTruthy();
    });

    it('renders priority buttons (Normal, High, Urgent)', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        expect(screen.getByText('Normal')).toBeTruthy();
        expect(screen.getByText('High')).toBeTruthy();
        expect(screen.getByText('Urgent')).toBeTruthy();
    });

    it('send button is disabled when inputs are empty', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        const sendBtn = screen.getByText('Send Broadcast');
        expect(sendBtn.closest('button')?.disabled).toBe(true);
    });

    it('send button enables when both inputs filled', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        fireEvent.change(screen.getByPlaceholderText(/Weather Alert/), { target: { value: 'Test Title' } });
        fireEvent.change(screen.getByPlaceholderText(/broadcast message/), { target: { value: 'Test message' } });
        const sendBtn = screen.getByText('Send Broadcast');
        expect(sendBtn.closest('button')?.disabled).toBe(false);
    });

    it('shows urgent warning when Urgent priority selected', () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        fireEvent.click(screen.getByText('Urgent'));
        expect(screen.getByText(/push notifications/)).toBeTruthy();
    });

    it('calls onSend with title, message, and priority', async () => {
        render(<BroadcastModal onClose={onClose} onSend={onSend} />);
        fireEvent.change(screen.getByPlaceholderText(/Weather Alert/), { target: { value: 'Rain' } });
        fireEvent.change(screen.getByPlaceholderText(/broadcast message/), { target: { value: 'Stop picking' } });
        fireEvent.click(screen.getByText('Send Broadcast'));

        await vi.waitFor(() => {
            // Por defecto, para todos (sin roles de destino)
            expect(onSend).toHaveBeenCalledWith('Rain', 'Stop picking', 'normal', []);
        });
    });
});
