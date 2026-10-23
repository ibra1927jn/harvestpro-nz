/**
 * Tests for MessagingContext — provider, hook, and messaging actions
 * 
 * Tests: sendMessage, sendBroadcast, getOrCreateConversation,
 *        markMessageRead, acknowledgeBroadcast, createChatGroup,
 *        loadConversation, setUserId, setOrchardId
 * @module context/MessagingContext.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';

// ── Hoisted mocks ─────────────────────────────────────
const mocks = vi.hoisted(() => ({
    sendMessage: vi.fn(),
    updateConversationTimestamp: vi.fn(),
    insertBroadcast: vi.fn(),
    findDirectConversation: vi.fn(),
    createConversation: vi.fn(),
    createGroupConversation: vi.fn(),
    getConversationMessages: vi.fn(),
    getConversations: vi.fn().mockResolvedValue([]),
    getBroadcasts: vi.fn().mockResolvedValue([]),
    getStaffList: vi.fn().mockResolvedValue([]),
    messageQueueAdd: vi.fn(),
    outboxForConversation: vi.fn(),
    outboxRetry: vi.fn(),
}));

vi.mock('@/services/config.service', () => ({
    getConfig: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }),
}));
vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        }),
        removeChannel: vi.fn(), removeAllChannels: vi.fn(),
    },
}));
vi.mock('@/services/message-outbox.service', () => ({
    messageOutbox: {
        queue: mocks.messageQueueAdd,
        flush: vi.fn().mockResolvedValue(0),
        forConversation: (...a: unknown[]) => mocks.outboxForConversation(...a),
        retry: (...a: unknown[]) => mocks.outboxRetry(...a),
        subscribe: () => () => undefined,
    },
}));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/utils/nzst', () => ({
    nowNZST: () => '2026-03-05T12:00:00+13:00',
}));
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: mocks.sendMessage,
        updateConversationTimestamp: mocks.updateConversationTimestamp,
        insertBroadcast: mocks.insertBroadcast,
        findDirectConversation: mocks.findDirectConversation,
        createConversation: mocks.createConversation,
        createGroupConversation: mocks.createGroupConversation,
        getConversationMessages: mocks.getConversationMessages,
        getConversations: mocks.getConversations,
        getBroadcasts: mocks.getBroadcasts,
    },
}));
vi.mock('@/repositories/user.repository', () => ({
    userRepository2: {
        getStaffList: mocks.getStaffList,
    },
}));

import { MessagingProvider, useMessaging } from './MessagingContext';

// ── Helpers ──────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) => <MessagingProvider>{children}</MessagingProvider>;

describe('MessagingContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.outboxForConversation.mockResolvedValue([]);
        mocks.outboxRetry.mockResolvedValue(undefined);
        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    });

    // ── Provider & Hook ──────────────────────────────
    describe('Provider & Hook', () => {
        it('renders children correctly', () => {
            render(<MessagingProvider><p>Hello Messaging</p></MessagingProvider>);
            expect(screen.getByText('Hello Messaging')).toBeTruthy();
        });

        it('useMessaging returns complete API shape', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            const ctx = result.current;
            // State
            expect(ctx).toHaveProperty('messages');
            expect(ctx).toHaveProperty('broadcasts');
            expect(ctx).toHaveProperty('chatGroups');
            expect(ctx).toHaveProperty('unreadCount');
            // Actions
            expect(typeof ctx.sendMessage).toBe('function');
            expect(typeof ctx.sendBroadcast).toBe('function');
            expect(typeof ctx.getOrCreateConversation).toBe('function');
            expect(typeof ctx.markMessageRead).toBe('function');
            expect(typeof ctx.acknowledgeBroadcast).toBe('function');
            expect(typeof ctx.createChatGroup).toBe('function');
            expect(typeof ctx.loadChatGroups).toBe('function');
            expect(typeof ctx.loadConversation).toBe('function');
            expect(typeof ctx.refreshMessages).toBe('function');
            expect(typeof ctx.setUserId).toBe('function');
            expect(typeof ctx.setOrchardId).toBe('function');
        });

        it('useMessaging throws outside provider', () => {
            expect(() => renderHook(() => useMessaging())).toThrow('useMessaging must be used within a MessagingProvider');
        });
    });

    // ── Initial State ────────────────────────────────
    describe('Initial State', () => {
        it('messages is initially empty', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(result.current.messages).toEqual([]);
        });

        it('broadcasts is initially empty', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(result.current.broadcasts).toEqual([]);
        });

        it('unreadCount is initially 0', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(result.current.unreadCount).toBe(0);
        });

        it('chatGroups is initially empty', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(result.current.chatGroups).toEqual([]);
        });
    });

    // ── setUserId / setOrchardId ─────────────────────
    describe('setUserId & setOrchardId', () => {
        it('setUserId does not throw', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(() => result.current.setUserId('user-1')).not.toThrow();
        });

        it('setOrchardId does not throw', () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });
            expect(() => result.current.setOrchardId('orchard-1')).not.toThrow();
        });
    });

    // ── sendMessage ──────────────────────────────────
    describe('sendMessage', () => {
        it('returns null when no userId set', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            let msg;
            await act(async () => {
                msg = await result.current.sendMessage('conv-1', 'Hello!');
            });

            expect(msg).toBeNull();
        });

        it('sends message online via repository', async () => {
            const mockMsg = { id: 'real-id', sender_id: 'user-1', content: 'Hello!', priority: 'normal', read_by: ['user-1'], created_at: '2026-03-05' };
            mocks.sendMessage.mockResolvedValue(mockMsg);
            mocks.updateConversationTimestamp.mockResolvedValue(undefined);

            const { result } = renderHook(() => useMessaging(), { wrapper });

            // Set userId first
            act(() => { result.current.setUserId('user-1'); });

            let response;
            await act(async () => {
                response = await result.current.sendMessage('conv-1', 'Hello!');
            });

            expect(mocks.sendMessage).toHaveBeenCalledWith('conv-1', 'user-1', 'Hello!', expect.objectContaining({ id: expect.any(String) }));
            // conversations.updated_at lo pone un trigger: el cliente ya no lo actualiza
            expect(mocks.updateConversationTimestamp).not.toHaveBeenCalled();
            expect(response).toEqual(mockMsg);
        });

        it('queues message offline when send fails', async () => {
            mocks.sendMessage.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            await act(async () => {
                await result.current.sendMessage('conv-1', 'Offline msg');
            });

            expect(mocks.messageQueueAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    sender_id: 'user-1',
                    content: 'Offline msg',
                    recipient_id: 'conv-1',
                })
            );
        });

        it('a reply carries reply_to_id online and in the offline queue', async () => {
            mocks.sendMessage.mockResolvedValueOnce({ id: 'r1', reply_to_id: 'orig' });
            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });
            await act(async () => {
                await result.current.sendMessage('conv-1', 'Yes', 'normal', { replyToId: 'orig' });
            });
            expect(mocks.sendMessage).toHaveBeenLastCalledWith('conv-1', 'user-1', 'Yes', expect.objectContaining({ replyToId: 'orig' }));

            mocks.sendMessage.mockRejectedValueOnce(new Error('Network error'));
            let queued: { reply_to_id?: string | null; delivery?: string } | null = null;
            await act(async () => {
                queued = await result.current.sendMessage('conv-1', 'Later', 'normal', { replyToId: 'orig' });
            });
            expect(mocks.messageQueueAdd).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'Later', reply_to_id: 'orig' }));
            expect(queued).toMatchObject({ reply_to_id: 'orig', delivery: 'pending' });
        });

        it('adds optimistic message to state immediately', async () => {
            mocks.sendMessage.mockResolvedValue({ id: 'x', sender_id: 'user-1', content: 'Hi' });
            mocks.updateConversationTimestamp.mockResolvedValue(undefined);

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            await act(async () => {
                await result.current.sendMessage('conv-1', 'Hi');
            });

            // Message should appear in state
            expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
            expect(result.current.messages[0].content).toBe('Hi');
        });
    });

    // ── sendBroadcast ────────────────────────────────
    describe('sendBroadcast', () => {
        it('does nothing without userId or orchardId', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            await act(async () => {
                await result.current.sendBroadcast('Title', 'Content');
            });

            expect(mocks.insertBroadcast).not.toHaveBeenCalled();
        });

        it('sends broadcast with both userId and orchardId', async () => {
            mocks.insertBroadcast.mockResolvedValue(undefined);

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => {
                result.current.setUserId('user-1');
                result.current.setOrchardId('orchard-1');
            });

            await act(async () => {
                await result.current.sendBroadcast('Alert', 'Weather warning');
            });

            expect(mocks.insertBroadcast).toHaveBeenCalled();
            // Should add to state
            expect(result.current.broadcasts.length).toBe(1);
            expect(result.current.broadcasts[0].title).toBe('Alert');
        });
    });

    // ── getOrCreateConversation ──────────────────────
    describe('getOrCreateConversation', () => {
        it('returns null without userId', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            let conv;
            await act(async () => {
                conv = await result.current.getOrCreateConversation('other-user');
            });

            expect(conv).toBeNull();
        });

        it('returns existing conversation', async () => {
            mocks.findDirectConversation.mockResolvedValue([{ id: 'conv-existing' }]);

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            let convId;
            await act(async () => {
                convId = await result.current.getOrCreateConversation('user-2');
            });

            expect(convId).toBe('conv-existing');
            expect(mocks.createConversation).not.toHaveBeenCalled();
        });

        it('creates new conversation when none exists', async () => {
            mocks.findDirectConversation.mockResolvedValue([]);
            mocks.createConversation.mockResolvedValue({ id: 'conv-new' });

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            let convId;
            await act(async () => {
                convId = await result.current.getOrCreateConversation('user-2');
            });

            expect(convId).toBe('conv-new');
            expect(mocks.createConversation).toHaveBeenCalledWith('direct', ['user-1', 'user-2'], 'user-1');
        });
    });

    // ── markMessageRead ──────────────────────────────
    describe('markMessageRead', () => {
        it('does nothing without userId', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            const before = { unread: result.current.unreadCount, messages: result.current.messages };
            await act(async () => {
                await result.current.markMessageRead('msg-1');
            });
            // Sin usuario no cambia nada
            expect(result.current.unreadCount).toBe(before.unread);
            expect(result.current.messages).toEqual(before.messages);
        });
    });

    // ── acknowledgeBroadcast ─────────────────────────
    describe('acknowledgeBroadcast', () => {
        it('does nothing without userId', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            const before = result.current.broadcasts;
            await act(async () => {
                await result.current.acknowledgeBroadcast('bc-1');
            });
            expect(result.current.broadcasts).toEqual(before);
        });
    });

    // ── createChatGroup ──────────────────────────────
    describe('createChatGroup', () => {
        it('returns null without userId', async () => {
            const { result } = renderHook(() => useMessaging(), { wrapper });

            let group;
            await act(async () => {
                group = await result.current.createChatGroup('Test Group', ['user-2']);
            });

            expect(group).toBeNull();
        });

        it('creates group and adds to state', async () => {
            mocks.createGroupConversation.mockResolvedValue({
                data: { id: 'group-1', name: 'Pickers Team', participant_ids: ['user-1', 'user-2'] },
                error: null,
            });

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            let group;
            await act(async () => {
                group = await result.current.createChatGroup('Pickers Team', ['user-2']);
            });

            expect(group).toBeDefined();
            expect(group!.name).toBe('Pickers Team');
            expect(result.current.chatGroups.length).toBe(1);
        });

        it('throws when group creation fails', async () => {
            mocks.createGroupConversation.mockResolvedValue({
                data: null, error: { message: 'DB error' },
            });

            const { result } = renderHook(() => useMessaging(), { wrapper });
            act(() => { result.current.setUserId('user-1'); });

            await expect(
                act(async () => { await result.current.createChatGroup('Bad', ['u2']); })
            ).rejects.toThrow();
        });
    });

    // ── loadConversation ─────────────────────────────
    describe('loadConversation', () => {
        it('returns messages from repository', async () => {
            const mockMessages = [
                { id: 'm1', sender_id: 'u1', content: 'Hi', priority: 'normal', read_by: [], created_at: '2026-03-05' },
                { id: 'm2', sender_id: 'u2', content: 'Hello', priority: 'normal', read_by: [], created_at: '2026-03-05' },
            ];
            mocks.getConversationMessages.mockResolvedValue(mockMessages);

            const { result } = renderHook(() => useMessaging(), { wrapper });

            let messages;
            await act(async () => {
                messages = await result.current.loadConversation('conv-1');
            });

            expect(messages).toEqual(mockMessages);
        });

        it('includes own messages that did not reach the server, marked failed or pending', async () => {
            // Antes un mensaje rechazado (bandeja synced=-1) no se veía: parecía enviado
            mocks.getConversationMessages.mockResolvedValue([
                { id: 'm1', sender_id: 'u1', content: 'Hi', priority: 'normal', read_by: [], created_at: '2026-03-05T10:00:00Z' },
            ]);
            mocks.outboxForConversation.mockResolvedValue([
                { id: 'q1', channel_type: 'direct', recipient_id: 'conv-1', sender_id: 'u1', content: 'Rejected', timestamp: '2026-03-05T10:01:00Z', synced: -1, status: 'failed', failure_reason: 'RLS' },
            ]);
            const { result } = renderHook(() => useMessaging(), { wrapper });
            let messages: Array<{ id: string; delivery?: string; failure_reason?: string }> = [];
            await act(async () => {
                messages = await result.current.loadConversation('conv-1');
            });
            expect(mocks.outboxForConversation).toHaveBeenCalledWith('conv-1');
            expect(messages.map(m => [m.id, m.delivery])).toEqual([['m1', undefined], ['q1', 'failed']]);
            expect(messages[1].failure_reason).toBe('RLS');
        });

        it('returns empty array on error', async () => {
            mocks.getConversationMessages.mockRejectedValue(new Error('DB error'));

            const { result } = renderHook(() => useMessaging(), { wrapper });

            let messages;
            await act(async () => {
                messages = await result.current.loadConversation('conv-bad');
            });

            expect(messages).toEqual([]);
        });
    });
});
