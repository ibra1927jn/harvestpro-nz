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
        it('returns unsubscribe function', () => {
            const channelMock = {
                on: vi.fn().mockReturnThis(),
                subscribe: vi.fn().mockReturnThis(),
            };
            vi.spyOn(supabase, 'channel').mockReturnValue(channelMock as never);
            vi.spyOn(supabase, 'removeChannel').mockImplementation(() => ({}) as never);

            const unsub = messagingRepository.subscribe('conv-1', vi.fn());
            expect(typeof unsub).toBe('function');
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
