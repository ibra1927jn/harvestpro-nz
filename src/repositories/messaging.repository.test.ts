/**
 * Messaging Repository Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { messagingRepository } from './messaging.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        insert: vi.fn(() => chain), update: vi.fn(() => chain),
        order: vi.fn(() => chain), range: vi.fn(() => chain), limit: vi.fn(() => chain),
        single: vi.fn(() => chain), contains: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('messagingRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('sendMessage', () => {
        it('sends and returns message', async () => {
            const msg = { id: 'm1', content: 'Hello' };
            fromSpy.mockReturnValue(mockChain({ data: msg, error: null }) as never);
            const result = await messagingRepository.sendMessage('conv-1', 'u1', 'Hello');
            expect(result).toEqual(msg);
            expect(fromSpy).toHaveBeenCalledWith('chat_messages');
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(messagingRepository.sendMessage('c1', 'u1', 'Hi')).rejects.toBeTruthy();
        });
    });

    describe('getMessages', () => {
        it('returns messages with sender join', async () => {
            const msgs = [{ id: 'm1', content: 'Hi', sender: { full_name: 'John' } }];
            fromSpy.mockReturnValue(mockChain({ data: msgs, error: null }) as never);
            expect(await messagingRepository.getMessages('conv-1')).toEqual(msgs);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(messagingRepository.getMessages('conv-1')).rejects.toBeTruthy();
        });
    });

    describe('getConversationMessages', () => {
        it('returns plain messages', async () => {
            const msgs = [{ id: 'm1', content: 'Hi' }];
            fromSpy.mockReturnValue(mockChain({ data: msgs, error: null }) as never);
            expect(await messagingRepository.getConversationMessages('conv-1')).toEqual(msgs);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await messagingRepository.getConversationMessages('conv-1')).toEqual([]);
        });
    });

    describe('subscribe', () => {
        type Handler = (p: { new?: unknown; payload?: unknown }) => void;
        function channelMock() {
            const handlers: Record<string, Handler> = {};
            const ch = {
                on: vi.fn((kind: string, filter: { event: string }, cb: Handler) => { handlers[`${kind}:${filter.event}`] = cb; return ch; }),
                subscribe: vi.fn(() => ch),
                send: vi.fn().mockResolvedValue('ok'),
            };
            return { ch, handlers };
        }

        it('opens ONE private channel per conversation and returns an unsubscribe function', () => {
            const { ch } = channelMock();
            const channelSpy = vi.spyOn(supabase, 'channel').mockReturnValue(ch as never);
            const removeSpy = vi.spyOn(supabase, 'removeChannel').mockImplementation(() => ({}) as never);

            const unsub = messagingRepository.subscribe('conv-1', vi.fn());
            expect(typeof unsub).toBe('function');
            expect(channelSpy).toHaveBeenCalledTimes(1);
            expect(channelSpy).toHaveBeenCalledWith('chat:conv-1', { config: { private: true, broadcast: { self: false } } });
            unsub();
            expect(removeSpy).toHaveBeenCalledWith(ch);
        });

        it('routes new messages, reaction broadcasts and typing to their handlers', () => {
            const { ch, handlers } = channelMock();
            vi.spyOn(supabase, 'channel').mockReturnValue(ch as never);
            const onMessage = vi.fn();
            const onReaction = vi.fn();
            const onTyping = vi.fn();
            messagingRepository.subscribe('conv-1', onMessage, { onReaction, onTyping });

            handlers['postgres_changes:INSERT']({ new: { id: 'm1' } });
            expect(onMessage).toHaveBeenCalledWith({ id: 'm1' });
            const ev = { op: 'add', message_id: 'm1', user_id: 'u2', emoji: '👍' };
            handlers['broadcast:reaction']({ payload: ev });
            handlers['broadcast:reaction']({ payload: { op: 'nope' } });
            expect(onReaction).toHaveBeenCalledTimes(1);
            expect(onReaction).toHaveBeenCalledWith(ev);
            handlers['broadcast:typing']({ payload: { user_id: 'u2' } });
            handlers['broadcast:typing']({ payload: {} });
            expect(onTyping).toHaveBeenCalledTimes(1);
            expect(onTyping).toHaveBeenCalledWith('u2');
        });

        it('sendTyping broadcasts on the same channel (never writes to the database)', () => {
            const { ch } = channelMock();
            vi.spyOn(supabase, 'channel').mockReturnValue(ch as never);
            const sub = messagingRepository.subscribe('conv-1', vi.fn());
            sub.sendTyping('me');
            expect(ch.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'typing', payload: { user_id: 'me' } });
            expect(fromSpy).not.toHaveBeenCalled();
        });
    });

    describe('reactions', () => {
        it('getReactions reads in chunks with a stable order', async () => {
            const chain = mockChain({ data: [{ message_id: 'm1', user_id: 'u1', emoji: '👍' }], error: null });
            fromSpy.mockReturnValue(chain as never);
            const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
            const rows = await messagingRepository.getReactions(ids);
            expect(fromSpy).toHaveBeenCalledWith('chat_message_reactions');
            // 250 ids → 3 trozos (nunca un .in() de 250 uuids: 414)
            expect((chain.in as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
            expect((chain.in as ReturnType<typeof vi.fn>).mock.calls.every(c => (c[1] as string[]).length <= 100)).toBe(true);
            expect((chain.order as ReturnType<typeof vi.fn>).mock.calls.slice(0, 3).map(c => c[0])).toEqual(['message_id', 'user_id', 'emoji']);
            expect(rows).toHaveLength(3);
        });

        it('addReaction is an idempotent upsert; removeReaction deletes my own', async () => {
            const chain = { ...mockChain({ data: null, error: null }), upsert: vi.fn(), delete: vi.fn(), match: vi.fn() };
            chain.upsert.mockReturnValue(chain);
            chain.delete.mockReturnValue(chain);
            chain.match.mockReturnValue(chain);
            fromSpy.mockReturnValue(chain as never);
            await messagingRepository.addReaction('m1', '👍');
            expect(chain.upsert).toHaveBeenCalledWith({ message_id: 'm1', emoji: '👍' }, { onConflict: 'message_id,user_id,emoji', ignoreDuplicates: true });
            await messagingRepository.removeReaction('m1', 'u1', '👍');
            expect(chain.match).toHaveBeenCalledWith({ message_id: 'm1', user_id: 'u1', emoji: '👍' });
        });

        it('throws when the server rejects a reaction', async () => {
            const chain = { ...mockChain({ data: null, error: { code: '42501', message: 'rls' } }), upsert: vi.fn() };
            chain.upsert.mockReturnValue(chain);
            fromSpy.mockReturnValue(chain as never);
            await expect(messagingRepository.addReaction('m1', '👍')).rejects.toMatchObject({ code: '42501' });
        });
    });

    describe('sendMessage with a reply', () => {
        it('sends reply_to_id', async () => {
            const chain = mockChain({ data: { id: 'm2' }, error: null });
            fromSpy.mockReturnValue(chain as never);
            await messagingRepository.sendMessage('c1', 'u1', 'Yes', { id: 'm2', replyToId: 'm1' });
            expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0][0]).toMatchObject({ id: 'm2', reply_to_id: 'm1' });
        });
    });

    describe('getConversations', () => {
        it('returns conversations for user', async () => {
            const convs = [{ id: 'c1', type: 'direct' }];
            fromSpy.mockReturnValue(mockChain({ data: convs, error: null }) as never);
            expect(await messagingRepository.getConversations('u1')).toEqual(convs);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(messagingRepository.getConversations('u1')).rejects.toBeTruthy();
        });
    });

    describe('createConversation', () => {
        it('creates and returns conversation', async () => {
            const conv = { id: 'c1', type: 'direct' };
            fromSpy.mockReturnValue(mockChain({ data: conv, error: null }) as never);
            expect(await messagingRepository.createConversation('direct', ['u1', 'u2'], 'u1')).toEqual(conv);
        });

        it('returns null on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            expect(await messagingRepository.createConversation('direct', ['u1'], 'u1')).toBeNull();
        });
    });

    describe('updateConversationTimestamp', () => {
        it('updates without throwing', async () => {
            await messagingRepository.updateConversationTimestamp('conv-1');
            expect(fromSpy).toHaveBeenCalledWith('conversations');
        });
    });

    describe('insertBroadcast', () => {
        it('inserts broadcast', async () => {
            await messagingRepository.insertBroadcast({ message: 'Hello all' });
            expect(fromSpy).toHaveBeenCalledWith('broadcasts');
        });
    });

    describe('findDirectConversation', () => {
        it('returns matching conversations', async () => {
            const convs = [{ id: 'c1' }];
            fromSpy.mockReturnValue(mockChain({ data: convs, error: null }) as never);
            expect(await messagingRepository.findDirectConversation('u1', 'u2')).toEqual(convs);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await messagingRepository.findDirectConversation('u1', 'u2')).toEqual([]);
        });
    });

    describe('createGroupConversation', () => {
        it('returns data and error', async () => {
            const conv = { id: 'g1', type: 'group' };
            fromSpy.mockReturnValue(mockChain({ data: conv, error: null }) as never);
            const result = await messagingRepository.createGroupConversation('Team', ['u1', 'u2'], 'u1');
            expect(result).toEqual({ data: conv, error: null });
        });
    });

    describe('getBroadcasts', () => {
        it('returns broadcasts for orchard', async () => {
            const bcs = [{ id: 'b1', message: 'Hello' }];
            fromSpy.mockReturnValue(mockChain({ data: bcs, error: null }) as never);
            expect(await messagingRepository.getBroadcasts('o1')).toEqual(bcs);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await messagingRepository.getBroadcasts('o1')).toEqual([]);
        });
    });

    describe('getLastMessages', () => {
        it('returns last messages for conversations (RPC last_messages)', async () => {
            const msgs = [{ conversation_id: 'c1', content: 'Hi' }];
            const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: msgs, error: null } as never);
            expect(await messagingRepository.getLastMessages(['c1'])).toEqual(msgs);
            expect(rpcSpy).toHaveBeenCalledWith('last_messages', { p_conversation_ids: ['c1'] });
        });

        it('returns empty on null', async () => {
            vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as never);
            expect(await messagingRepository.getLastMessages(['c1'])).toEqual([]);
        });

        it('returns empty on error', async () => {
            vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'x' } } as never);
            expect(await messagingRepository.getLastMessages(['c1'])).toEqual([]);
        });
    });
});
