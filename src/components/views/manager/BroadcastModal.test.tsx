/**
 * BroadcastModal — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSendBroadcast = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../context/MessagingContext', () => ({
    useMessaging: () => ({ sendBroadcast: mockSendBroadcast }),
}));

import BroadcastModal from './BroadcastModal';

describe('BroadcastModal', () => {
    const onClose = vi.fn();

    beforeEach(() => vi.clearAllMocks());

    it('renders Broadcast Alert heading', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByText('Broadcast Alert')).toBeTruthy();
    });

    it('renders subtitle', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByText('Send push notification to all staff')).toBeTruthy();
    });

    it('renders title input', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByPlaceholderText('e.g. Weather Alert')).toBeTruthy();
    });

    it('renders message textarea', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByPlaceholderText('Type your message here...')).toBeTruthy();
    });

    it('renders priority buttons', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByText('Normal')).toBeTruthy();
        expect(screen.getByText('High')).toBeTruthy();
        expect(screen.getByText('Urgent')).toBeTruthy();
    });

    it('renders Send Broadcast button', () => {
        render(<BroadcastModal onClose={onClose} />);
        expect(screen.getByText('Send Broadcast')).toBeTruthy();
    });

    it('send button is disabled when title and message empty', () => {
        render(<BroadcastModal onClose={onClose} />);
        const sendBtn = screen.getByText('Send Broadcast').closest('button')!;
        expect(sendBtn.disabled).toBe(true);
    });

    it('calls onClose when close button clicked', () => {
        render(<BroadcastModal onClose={onClose} />);
        fireEvent.click(screen.getByText('close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('allows typing in title and message', () => {
        render(<BroadcastModal onClose={onClose} />);
        const titleInput = screen.getByPlaceholderText('e.g. Weather Alert');
        const msgInput = screen.getByPlaceholderText('Type your message here...');
        fireEvent.change(titleInput, { target: { value: 'Test Title' } });
        fireEvent.change(msgInput, { target: { value: 'Test message body' } });
        expect((titleInput as HTMLInputElement).value).toBe('Test Title');
        expect((msgInput as HTMLTextAreaElement).value).toBe('Test message body');
    });
});
