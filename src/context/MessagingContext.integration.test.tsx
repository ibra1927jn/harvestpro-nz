/**
 * Integration tests for MessagingContext — full provider rendering
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// All vi.mock factories use inline values only (no top-level variable references)
vi.mock('../services/supabase', () => ({
    supabase: {
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
            unsubscribe: vi.fn(),
        }),
        removeChannel: vi.fn(),
    },
}));

vi.mock('../services/db', () => ({
    db: { message_queue: { add: vi.fn().mockResolvedValue(undefined) } },
}));

vi.mock('@/utils/nzst', () => ({
    nowNZST: () => '2026-03-10T12:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: vi.fn().mockResolvedValue({ id: 'm1', content: 'test', sender_id: 'u1', created_at: '2026-03-10', read_by: ['u1'] }),
        updateConversationTimestamp: vi.fn().mockResolvedValue(undefined),
        findDirectConversation: vi.fn().mockResolvedValue([{ id: 'conv1' }]),
        createConversation: vi.fn().mockResolvedValue({ id: 'conv-new', name: null, participant_ids: ['u1', 'u2'] }),
        getConversationMessages: vi.fn().mockResolvedValue([]),
        getBroadcasts: vi.fn().mockResolvedValue([]),
        getConversations: vi.fn().mockResolvedValue([]),
        insertBroadcast: vi.fn().mockResolvedValue(undefined),
        createGroupConversation: vi.fn().mockResolvedValue({ data: { id: 'g1', name: 'Group', participant_ids: ['u1', 'u2'] }, error: null }),
        getLastMessages: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/repositories/user.repository', () => ({
    userRepository2: { getNamesByIds: vi.fn().mockResolvedValue({}) },
}));

import { MessagingProvider, useMessaging } from './MessagingContext';
import { messagingRepository } from '@/repositories/messaging.repository';

// Consumer that exposes context methods
function MsgConsumer() {
    const ctx = useMessaging();
    return React.createElement('div', null,
        React.createElement('span', { 'data-testid': 'unread' }, String(ctx.unreadCount)),
        React.createElement('span', { 'data-testid': 'msg-count' }, String(ctx.messages.length)),
        React.createElement('span', { 'data-testid': 'broadcast-count' }, String(ctx.broadcasts.length)),
        React.createElement('button', { 'data-testid': 'set-user', onClick: () => { ctx.setUserId('u1'); ctx.setOrchardId('o1'); } }, 'SetUser'),
        React.createElement('button', { 'data-testid': 'send-msg', onClick: () => ctx.sendMessage('conv1', 'Hello!').catch(() => { }) }, 'SendMsg'),
        React.createElement('button', { 'data-testid': 'send-broadcast', onClick: () => ctx.sendBroadcast('Alert', 'Test broadcast').catch(() => { }) }, 'Broadcast'),
        React.createElement('button', { 'data-testid': 'mark-read', onClick: () => ctx.markMessageRead('m1') }, 'MarkRead'),
        React.createElement('button', { 'data-testid': 'ack-broadcast', onClick: () => ctx.acknowledgeBroadcast('b1') }, 'AckBroadcast'),
        React.createElement('button', { 'data-testid': 'get-conv', onClick: () => ctx.getOrCreateConversation('u2').catch(() => { }) }, 'GetConv'),
        React.createElement('button', { 'data-testid': 'create-group', onClick: () => ctx.createChatGroup('TestGroup', ['u2']).catch(() => { }) }, 'CreateGroup'),
        React.createElement('button', { 'data-testid': 'load-conv', onClick: () => ctx.loadConversation('conv1') }, 'LoadConv'),
        React.createElement('button', { 'data-testid': 'refresh', onClick: () => ctx.refreshMessages() }, 'Refresh'),
    );
}

describe('MessagingContext Integration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders provider with children', () => {
        render(React.createElement(MessagingProvider, null, React.createElement('div', { 'data-testid': 'child' }, 'Hi')));
        expect(screen.getByTestId('child')).toBeDefined();
    });

    it('starts with 0 unread and 0 messages', () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        expect(screen.getByTestId('unread').textContent).toBe('0');
        expect(screen.getByTestId('msg-count').textContent).toBe('0');
    });

    it('setUserId and setOrchardId do not crash', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        // El proveedor sigue montado y sin datos inventados
        expect(screen.getByTestId('unread').textContent).toBe('0');
    });

    it('sendMessage adds optimistic message', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        await act(async () => { screen.getByTestId('send-msg').click(); });
        await waitFor(() => expect(screen.getByTestId('msg-count').textContent).toBe('1'));
    });

    it('sendBroadcast calls repository', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        await act(async () => { screen.getByTestId('send-broadcast').click(); });
        await waitFor(() => expect(vi.mocked(messagingRepository.insertBroadcast)).toHaveBeenCalled());
    });

    it('getOrCreateConversation finds existing', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        await act(async () => { screen.getByTestId('get-conv').click(); });
        await waitFor(() => expect(vi.mocked(messagingRepository.findDirectConversation)).toHaveBeenCalled());
    });

    it('createChatGroup calls repository', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        await act(async () => { screen.getByTestId('create-group').click(); });
        await waitFor(() => expect(vi.mocked(messagingRepository.createGroupConversation)).toHaveBeenCalled());
    });

    it('loadConversation calls repository', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('load-conv').click(); });
        await waitFor(() => expect(vi.mocked(messagingRepository.getConversationMessages)).toHaveBeenCalledWith('conv1'));
    });

    it('refreshMessages loads broadcasts and conversations', async () => {
        render(React.createElement(MessagingProvider, null, React.createElement(MsgConsumer)));
        await act(async () => { screen.getByTestId('set-user').click(); });
        await act(async () => { screen.getByTestId('refresh').click(); });
        await waitFor(() => {
            expect(vi.mocked(messagingRepository.getBroadcasts)).toHaveBeenCalled();
            expect(vi.mocked(messagingRepository.getConversations)).toHaveBeenCalled();
        });
    });

    it('useMessaging throws outside provider', () => {
        expect(() => render(React.createElement(MsgConsumer))).toThrow('useMessaging must be used within a MessagingProvider');
    });
});
