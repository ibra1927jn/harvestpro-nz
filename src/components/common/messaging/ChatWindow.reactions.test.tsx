/**
 * ChatWindow — reacciones (botón y pulsación larga), responder con cita (y saltar
 * al original) e «Escribiendo…».
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import ChatWindow, { LONG_PRESS_MS } from './ChatWindow';
import type { DBMessage } from '@/context/messaging.types';

const chat = { id: 'c1', name: 'Block A', members: ['u1', 'u2', 'u3'], isGroup: true };
const at = new Date().toISOString();
const msg = (id: string, sender: string, content: string, extra: Partial<DBMessage> = {}): DBMessage => ({
    id, sender_id: sender, content, priority: 'normal', read_by: [], conversation_id: 'c1', created_at: at, ...extra,
});

function setup(messages: DBMessage[], extra: Partial<React.ComponentProps<typeof ChatWindow>> = {}) {
    const onSend = vi.fn();
    const onToggleReaction = vi.fn().mockResolvedValue(true);
    const onTyping = vi.fn();
    const onSent = vi.fn();
    const utils = render(
        <ChatWindow selectedChat={chat} messages={messages} appUserId="u1" isManager={false}
            userNameMap={{ u1: 'Me', u2: 'Bob', u3: 'Ana' }} isSending={false} onSend={onSend} onBack={vi.fn()}
            onToggleReaction={onToggleReaction} onTyping={onTyping} onSent={onSent} {...extra} />
    );
    return { ...utils, onSend, onToggleReaction, onTyping, onSent };
}

const bubbleOf = (text: string) => screen.getByText(text).closest('[data-testid="chat-msg-body"]') as HTMLElement;
const rowOf = (text: string) => screen.getByText(text).closest('[data-msg-id]') as HTMLElement;

beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('ChatWindow reactions', () => {
    it('shows the saved reactions with their count and marks mine', () => {
        setup([msg('m1', 'u2', 'Row 12 done')], {
            reactions: { m1: [
                { emoji: '👍', count: 2, mine: true, userIds: ['u1', 'u3'] },
                { emoji: '😂', count: 1, mine: false, userIds: ['u2'] },
            ] },
        });
        const thumbs = screen.getByRole('button', { name: '👍 2. Tap to add or remove yours' });
        expect(thumbs).toHaveAttribute('aria-pressed', 'true');
        expect(thumbs).toHaveAttribute('title', '👍 You, Ana');
        expect(screen.getByRole('button', { name: '😂 1. Tap to add or remove yours' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('tapping a reaction badge toggles mine', () => {
        const { onToggleReaction } = setup([msg('m1', 'u2', 'Hi')], {
            reactions: { m1: [{ emoji: '👍', count: 1, mine: false, userIds: ['u2'] }] },
        });
        fireEvent.click(screen.getByRole('button', { name: '👍 1. Tap to add or remove yours' }));
        expect(onToggleReaction).toHaveBeenCalledWith('m1', '👍');
    });

    it('the react button opens the short emoji set; picking one reacts and closes it', () => {
        const { onToggleReaction } = setup([msg('m1', 'u2', 'Need a bin')]);
        fireEvent.click(within(rowOf('Need a bin')).getByRole('button', { name: 'React' }));
        const bar = screen.getByRole('group', { name: 'Message options' });
        expect(within(bar).getAllByRole('button', { name: /^React with/ })).toHaveLength(6);
        fireEvent.click(within(bar).getByRole('button', { name: 'React with ❤️' }));
        expect(onToggleReaction).toHaveBeenCalledWith('m1', '❤️');
        expect(screen.queryByRole('group')).toBeNull();
    });

    it('a long press on the message opens the reactions; a short tap does not', () => {
        vi.useFakeTimers();
        setup([msg('m1', 'u2', 'Long press me')]);
        const bubble = bubbleOf('Long press me');
        fireEvent.pointerDown(bubble);
        act(() => { vi.advanceTimersByTime(LONG_PRESS_MS - 100); });
        fireEvent.pointerUp(bubble);
        act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });
        expect(screen.queryByRole('group')).toBeNull();

        fireEvent.pointerDown(bubble);
        act(() => { vi.advanceTimersByTime(LONG_PRESS_MS); });
        expect(screen.getByRole('group', { name: 'Message options' })).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' });
        expect(screen.queryByRole('group')).toBeNull();
    });

    it('messages not delivered yet cannot be reacted to or quoted', () => {
        setup([msg('m1', 'u1', 'Still pending', { delivery: 'pending' })]);
        expect(within(rowOf('Still pending')).queryByRole('button', { name: 'React' })).toBeNull();
        expect(within(rowOf('Still pending')).queryByRole('button', { name: 'Reply' })).toBeNull();
    });

    it('if the reaction cannot be saved it says so', async () => {
        setup([msg('m1', 'u2', 'Hi')], {
            onToggleReaction: vi.fn().mockResolvedValue(false),
            reactions: { m1: [{ emoji: '👍', count: 1, mine: false, userIds: ['u2'] }] },
        });
        fireEvent.click(screen.getByRole('button', { name: '👍 1. Tap to add or remove yours' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the reaction');
    });
});

describe('ChatWindow replies', () => {
    it('reply shows the quote above the box and sends with reply_to_id', () => {
        const { onSend, onSent } = setup([msg('m1', 'u2', 'Where is the tractor?')]);
        fireEvent.click(within(rowOf('Where is the tractor?')).getByRole('button', { name: 'Reply' }));
        const input = screen.getByPlaceholderText('Type your reply...');
        fireEvent.change(input, { target: { value: 'Row 4' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSend).toHaveBeenCalledWith('Row 4', 'm1');
        expect(onSent).toHaveBeenCalled();
        // La cita del cuadro de texto se va al enviar
        expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull();
    });

    it('a normal message is sent without reply_to_id', () => {
        const { onSend } = setup([]);
        const input = screen.getByPlaceholderText('Type a message...');
        fireEvent.change(input, { target: { value: 'Hello' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSend).toHaveBeenCalledWith('Hello');
    });

    it('a reply shows who and what it quotes; tapping the quote jumps to the original', () => {
        vi.useFakeTimers();
        setup([
            msg('m1', 'u2', 'Where is the tractor?'),
            msg('m2', 'u1', 'Row 4', { reply_to_id: 'm1' }),
        ]);
        const quote = within(rowOf('Row 4')).getByRole('button', { name: 'Go to the original message' });
        expect(quote).toHaveTextContent('Bob');
        expect(quote).toHaveTextContent('Where is the tractor?');
        fireEvent.click(quote);
        const row = document.querySelector('[data-msg-id="m1"]') as HTMLElement;
        const original = row.querySelector('[data-testid="chat-msg-body"]') as HTMLElement;
        expect(row.scrollIntoView).toHaveBeenCalled();
        expect(original.className).toContain('ring-amber-300');
        act(() => { vi.advanceTimersByTime(2000); });
        expect(original.className).not.toContain('ring-amber-300');
    });

    it('quoting a photo without text says it is a photo; an original not loaded is "Earlier message"', () => {
        setup([
            msg('p1', 'u2', '', { attachment_path: 'c1/x.jpg', attachment_type: 'image', attachment_size: 10 }),
            msg('m2', 'u1', 'Nice', { reply_to_id: 'p1' }),
            msg('m3', 'u1', 'Old one', { reply_to_id: 'gone' }),
        ]);
        expect(within(rowOf('Nice')).getByRole('button', { name: 'Go to the original message' })).toHaveTextContent('Photo');
        const old = within(rowOf('Old one')).getByRole('button', { name: 'Go to the original message' });
        expect(old).toHaveTextContent('Earlier message');
        expect(old).toBeDisabled();
    });
});

describe('ChatWindow typing indicator', () => {
    it('each keystroke is passed on (the hook rate-limits it)', () => {
        const { onTyping } = setup([]);
        fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'H' } });
        expect(onTyping).toHaveBeenCalledWith('H');
    });

    it('shows who is typing, never me', async () => {
        const { rerender } = setup([msg('m1', 'u2', 'Hi')], { typingUserIds: ['u2'] });
        expect(screen.getByRole('status', { name: 'Bob is typing…' })).toBeInTheDocument();
        rerender(
            <ChatWindow selectedChat={chat} messages={[msg('m1', 'u2', 'Hi')]} appUserId="u1" isManager={false}
                userNameMap={{ u1: 'Me', u2: 'Bob', u3: 'Ana' }} isSending={false} onSend={vi.fn()} onBack={vi.fn()}
                typingUserIds={['u2', 'u3', 'u1']} />
        );
        expect(screen.getByRole('status', { name: 'Bob and Ana are typing…' })).toBeInTheDocument();
        rerender(
            <ChatWindow selectedChat={chat} messages={[msg('m1', 'u2', 'Hi')]} appUserId="u1" isManager={false}
                userNameMap={{ u1: 'Me', u2: 'Bob', u3: 'Ana' }} isSending={false} onSend={vi.fn()} onBack={vi.fn()}
                typingUserIds={['u1']} />
        );
        await waitFor(() => expect(screen.queryByRole('status', { name: /typing/ })).toBeNull());
    });
});
