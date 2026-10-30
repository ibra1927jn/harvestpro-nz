/**
 * useConversationLive: un solo canal por conversación; reacciones en vivo, al
 * abrir (con las pendientes de la cola) y las mías; «Escribiendo…» con límites.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DBMessage } from '@/context/messaging.types';
import type { ConversationHandlers } from '@/repositories/messaging.repository';

const unsubscribe = vi.fn();
const sendTyping = vi.fn();
let handlers: ConversationHandlers = {};
let onMessage: (m: { id: string; sender_id: string; conversation_id: string }) => void = () => {};
const subscribeToConversation = vi.fn();
vi.mock('@/services/simple-messaging.service', () => ({
    simpleMessagingService: {
        subscribeToConversation: (...a: unknown[]) => subscribeToConversation(...a),
    },
}));
const list = vi.fn();
const pendingFor = vi.fn();
const toggle = vi.fn();
vi.mock('@/services/chat-reactions.service', () => ({
    chatReactionsService: {
        list: (...a: unknown[]) => list(...a),
        pendingFor: (...a: unknown[]) => pendingFor(...a),
        toggle: (...a: unknown[]) => toggle(...a),
    },
}));

import { useConversationLive } from './useConversationLive';
import { TYPING_THROTTLE_MS, TYPING_TIMEOUT_MS } from '@/services/chat-typing';

const msg = (id: string, conv = 'c1', extra: Partial<DBMessage> = {}): DBMessage => ({
    id, sender_id: 'u2', content: id, priority: 'normal', read_by: [], conversation_id: conv, created_at: '2026-10-23T10:00:00+13:00', ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    subscribeToConversation.mockImplementation((_id: string, cb: typeof onMessage, h: ConversationHandlers) => {
        onMessage = cb;
        handlers = h;
        return Object.assign(() => unsubscribe(), { sendTyping });
    });
    list.mockResolvedValue([]);
    pendingFor.mockResolvedValue([]);
    toggle.mockResolvedValue('saved');
});
afterEach(() => vi.useRealTimers());

function setup(initial: { conversationId: string | null; messages: DBMessage[] }) {
    const onIncomingMessage = vi.fn();
    const utils = renderHook(
        (p: { conversationId: string | null; messages: DBMessage[] }) =>
            useConversationLive({ conversationId: p.conversationId, me: 'me', messages: p.messages, onIncomingMessage }),
        { initialProps: initial }
    );
    return { ...utils, onIncomingMessage };
}

describe('useConversationLive', () => {
    it('opens one channel per conversation and closes it when leaving', () => {
        const { rerender, unmount } = setup({ conversationId: 'c1', messages: [] });
        expect(subscribeToConversation).toHaveBeenCalledTimes(1);
        rerender({ conversationId: 'c1', messages: [msg('m1')] });
        expect(subscribeToConversation).toHaveBeenCalledTimes(1);
        rerender({ conversationId: 'c2', messages: [] });
        expect(subscribeToConversation).toHaveBeenCalledTimes(2);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('loads the reactions once for the delivered messages of THIS conversation, plus my queued ones', async () => {
        list.mockResolvedValue([{ message_id: 'm1', user_id: 'u2', emoji: '👍' }]);
        pendingFor.mockResolvedValue([{ op: 'add', message_id: 'm1', user_id: 'me', emoji: '👍' }]);
        const { result, rerender } = setup({ conversationId: 'c1', messages: [msg('old', 'c0')] });
        expect(list).not.toHaveBeenCalled();
        rerender({ conversationId: 'c1', messages: [msg('m1'), msg('p1', 'c1', { delivery: 'pending' })] });
        await waitFor(() => expect(result.current.reactions.m1?.[0]).toMatchObject({ emoji: '👍', count: 2, mine: true }));
        expect(list).toHaveBeenCalledWith(['m1']);
        expect(pendingFor).toHaveBeenCalledWith('c1');
        // Un mensaje nuevo no lanza otra consulta: sus reacciones llegan por el canal
        rerender({ conversationId: 'c1', messages: [msg('m1'), msg('m2')] });
        expect(list).toHaveBeenCalledTimes(1);
    });

    it('applies live reaction events (also twice the same, and removals)', async () => {
        const { result } = setup({ conversationId: 'c1', messages: [] });
        act(() => {
            handlers.onReaction?.({ op: 'add', message_id: 'm1', user_id: 'u2', emoji: '😂' });
            handlers.onReaction?.({ op: 'add', message_id: 'm1', user_id: 'u2', emoji: '😂' });
        });
        expect(result.current.reactions.m1).toEqual([{ emoji: '😂', count: 1, mine: false, userIds: ['u2'] }]);
        act(() => { handlers.onReaction?.({ op: 'remove', message_id: 'm1', user_id: 'u2', emoji: '😂' }); });
        expect(result.current.reactions.m1).toBeUndefined();
    });

    it('toggleReaction is optimistic and undone if the server rejects it', async () => {
        const { result } = setup({ conversationId: 'c1', messages: [] });
        await act(async () => { expect(await result.current.toggleReaction('m1', '👍')).toBe(true); });
        expect(toggle).toHaveBeenLastCalledWith({ conversationId: 'c1', messageId: 'm1', userId: 'me', emoji: '👍', remove: false });
        expect(result.current.reactions.m1?.[0]).toMatchObject({ mine: true, count: 1 });

        toggle.mockRejectedValueOnce(new Error('rls'));
        await act(async () => { expect(await result.current.toggleReaction('m1', '👍')).toBe(false); });
        expect(toggle).toHaveBeenLastCalledWith(expect.objectContaining({ remove: true }));
        expect(result.current.reactions.m1?.[0]).toMatchObject({ mine: true, count: 1 });
    });

    it('typing: at most one event every 3 s; others shown until 5 s or their message', () => {
        vi.useFakeTimers();
        let now = 10_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { result, onIncomingMessage } = setup({ conversationId: 'c1', messages: [] });

        act(() => { result.current.notifyTyping('h'); result.current.notifyTyping('he'); });
        expect(sendTyping).toHaveBeenCalledTimes(1);
        expect(sendTyping).toHaveBeenCalledWith('me');
        now += TYPING_THROTTLE_MS;
        act(() => { result.current.notifyTyping('hel'); });
        expect(sendTyping).toHaveBeenCalledTimes(2);

        act(() => { handlers.onTyping?.('me'); handlers.onTyping?.('u2'); });
        expect(result.current.typingUserIds).toEqual(['u2']);
        act(() => { vi.advanceTimersByTime(TYPING_TIMEOUT_MS); });
        expect(result.current.typingUserIds).toEqual([]);

        act(() => { handlers.onTyping?.('u2'); });
        act(() => { onMessage({ id: 'm9', sender_id: 'u2', conversation_id: 'c1' }); });
        expect(result.current.typingUserIds).toEqual([]);
        expect(onIncomingMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'm9' }));
    });

    it('without a conversation nothing is opened', () => {
        setup({ conversationId: null, messages: [] });
        expect(subscribeToConversation).not.toHaveBeenCalled();
    });
});
