/**
 * ChatWindow — adjuntos (foto/PDF), notas de voz e info del chat.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatWindow from './ChatWindow';
import { chatAttachmentsService } from '@/services/chat-attachments.service';
import type { DBMessage } from '@/context/messaging.types';

const chat = { id: 'c1', name: 'Block A', members: ['u1', 'u2'], isGroup: true };
const base = { priority: 'normal' as const, read_by: [], conversation_id: 'c1', created_at: new Date().toISOString() };

function setup(messages: DBMessage[] = [], extra: Partial<React.ComponentProps<typeof ChatWindow>> = {}) {
    const onSendAttachment = vi.fn().mockResolvedValue(undefined);
    const onOpenInfo = vi.fn();
    const utils = render(
        <ChatWindow selectedChat={chat} messages={messages} appUserId="u1" isManager={false}
            userNameMap={{ u1: 'Me', u2: 'Bob' }} isSending={false} onSend={vi.fn()} onBack={vi.fn()}
            onSendAttachment={onSendAttachment} onOpenInfo={onOpenInfo} {...extra} />
    );
    return { ...utils, onSendAttachment, onOpenInfo };
}

const pick = (file: File) => {
    const input = screen.getByTestId('chat-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
};

beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = function () {};
    vi.spyOn(chatAttachmentsService, 'signedUrl').mockImplementation(async p => `https://signed/${p}`);
});
afterEach(() => vi.restoreAllMocks());

describe('ChatWindow attachments', () => {
    it('the attach button opens the file picker (photos and PDF)', () => {
        setup();
        const input = screen.getByTestId('chat-file-input') as HTMLInputElement;
        const click = vi.spyOn(input, 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
        expect(click).toHaveBeenCalled();
        expect(input.accept).toBe('image/jpeg,image/png,image/webp,application/pdf');
    });

    it('sends a picked PDF with its name, and the typed text as caption', async () => {
        const { onSendAttachment } = setup();
        fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Contract' } });
        pick(new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' }));
        await waitFor(() => expect(onSendAttachment).toHaveBeenCalled());
        expect(onSendAttachment.mock.calls[0][0]).toMatchObject({ type: 'pdf', mime: 'application/pdf', ext: 'pdf', name: 'contract.pdf', caption: 'Contract' });
    });

    it('sends a picked photo as image', async () => {
        const { onSendAttachment } = setup();
        pick(new File(['jpg'], 'row12.jpg', { type: 'image/jpeg' }));
        await waitFor(() => expect(onSendAttachment).toHaveBeenCalled());
        expect(onSendAttachment.mock.calls[0][0]).toMatchObject({ type: 'image', ext: 'jpg' });
    });

    it('refuses other file types and files over 10 MB', async () => {
        const { onSendAttachment } = setup();
        pick(new File(['<html>'], 'x.html', { type: 'text/html' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Only photos/);
        const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
        Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
        pick(big);
        expect(await screen.findByRole('alert')).toHaveTextContent(/too big/);
        expect(onSendAttachment).not.toHaveBeenCalled();
    });

    it('warns when the offline queue is full', async () => {
        setup([], { onSendAttachment: vi.fn().mockResolvedValue('queue_full') });
        pick(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Not enough room on this phone/);
    });

    it('shows a photo thumbnail that opens full screen', async () => {
        setup([{ ...base, id: 'm1', sender_id: 'u2', content: '', attachment_path: 'c1/m1.jpg', attachment_type: 'image', attachment_name: 'row.jpg', attachment_size: 100 }]);
        const btn = await screen.findByRole('button', { name: 'View photo row.jpg' });
        await waitFor(() => expect(btn).not.toBeDisabled());
        fireEvent.click(btn);
        expect(screen.getByRole('dialog', { name: 'row.jpg' })).toBeInTheDocument();
        expect(screen.getAllByRole('img', { name: 'row.jpg' })[1]).toHaveAttribute('src', 'https://signed/c1/m1.jpg');
    });

    it('shows a PDF with name, size and an open link', async () => {
        setup([{ ...base, id: 'm1', sender_id: 'u2', content: 'here', attachment_path: 'c1/m1.pdf', attachment_type: 'pdf', attachment_name: 'roster.pdf', attachment_size: 350 * 1024 }]);
        const link = await screen.findByRole('link', { name: /roster\.pdf/ });
        await waitFor(() => expect(link).toHaveAttribute('href', 'https://signed/c1/m1.pdf'));
        expect(link).toHaveTextContent('350 KB');
        expect(screen.getByText('here')).toBeInTheDocument();
    });

    it('shows a voice note player with its duration', async () => {
        const { container } = setup([{ ...base, id: 'm1', sender_id: 'u2', content: '', attachment_path: 'c1/m1.webm', attachment_type: 'audio', attachment_size: 10, duration_ms: 42_000 }]);
        await waitFor(() => expect(container.querySelector('audio')).toHaveAttribute('src', 'https://signed/c1/m1.webm'));
        expect(screen.getByText('0:42')).toBeInTheDocument();
    });

    it('an attachment still on the phone says it is sending', () => {
        setup([{ ...base, id: 'm1', sender_id: 'u1', content: '', delivery: 'pending', local_file_id: 'm1', attachment_path: 'c1/m1.pdf', attachment_type: 'pdf', attachment_size: 10 }]);
        expect(screen.getByText(/Sending… \(will upload when there is signal\)/)).toBeInTheDocument();
    });

    it('the ⋮ button opens the chat info', () => {
        const { onOpenInfo } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Chat info' }));
        expect(onOpenInfo).toHaveBeenCalled();
    });
});

// ── Notas de voz ────────────────────────────────────────────────────────────
class FakeRecorder {
    static isTypeSupported = (m: string) => m.startsWith('audio/webm');
    static last: FakeRecorder | null = null;
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_s: unknown, opts?: { mimeType?: string }) {
        this.mimeType = opts?.mimeType ?? 'audio/webm';
        FakeRecorder.last = this;
    }
    start() { this.state = 'recording'; }
    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['opus'], { type: this.mimeType }) });
        this.onstop?.();
    }
}

describe('ChatWindow voice notes', () => {
    const stopTrack = vi.fn();
    beforeEach(() => {
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('tap to record shows a counter; send uploads it as audio with its duration', async () => {
        const { onSendAttachment } = setup();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Record voice message' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Recording 0:00 / 2:00');
        fireEvent.click(screen.getByRole('button', { name: 'Send voice note' }));
        await waitFor(() => expect(onSendAttachment).toHaveBeenCalled());
        expect(onSendAttachment.mock.calls[0][0]).toMatchObject({ type: 'audio', mime: 'audio/webm', ext: 'webm' });
        expect(typeof onSendAttachment.mock.calls[0][0].durationMs).toBe('number');
        expect(stopTrack).toHaveBeenCalled();
    });

    it('cancel throws the recording away', async () => {
        const { onSendAttachment } = setup();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Record voice message' }));
        await screen.findByRole('status');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel voice note' }));
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
        expect(onSendAttachment).not.toHaveBeenCalled();
    });

    it('hold to record: releasing after a moment sends it', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const { onSendAttachment } = setup();
            fireEvent.pointerDown(screen.getByRole('button', { name: 'Record voice message' }));
            await screen.findByRole('status');
            await act(async () => { vi.advanceTimersByTime(1500); });
            fireEvent.pointerUp(screen.getByRole('button', { name: 'Send voice note' }));
            await waitFor(() => expect(onSendAttachment).toHaveBeenCalled());
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops by itself at 2 minutes and still sends the note', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const { onSendAttachment } = setup();
            fireEvent.pointerDown(screen.getByRole('button', { name: 'Record voice message' }));
            await screen.findByRole('status');
            await act(async () => { vi.advanceTimersByTime(120_000); });
            await waitFor(() => expect(onSendAttachment).toHaveBeenCalled());
            expect(onSendAttachment.mock.calls[0][0].durationMs).toBeLessThanOrEqual(120_000);
        } finally {
            vi.useRealTimers();
        }
    });

    it('explains how to allow the microphone when it is denied', async () => {
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) },
        });
        setup();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Record voice message' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Microphone blocked/);
    });
});
