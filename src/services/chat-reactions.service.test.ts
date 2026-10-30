/**
 * Reacciones: con red se guardan; sin red van a la cola (CHAT_REACTION) y poner
 * y quitar sin red se anulan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addReaction = vi.fn();
const removeReaction = vi.fn();
const getReactions = vi.fn();
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        addReaction: (...a: unknown[]) => addReaction(...a),
        removeReaction: (...a: unknown[]) => removeReaction(...a),
        getReactions: (...a: unknown[]) => getReactions(...a),
    },
}));
const addToQueue = vi.fn();
vi.mock('./sync.service', async () => {
    const { db } = await import('./db');
    return {
        syncService: {
            addToQueue: async (type: string, payload: Record<string, unknown>) => {
                addToQueue(type, payload);
                await db.sync_queue.put({ id: crypto.randomUUID(), type: type as 'CHAT_REACTION', payload, timestamp: Date.now(), retryCount: 0 });
            },
            getQueue: () => db.sync_queue.orderBy('timestamp').toArray(),
        },
    };
});

import { db } from './db';
import { chatReactionsService } from './chat-reactions.service';

const C1 = '11111111-1111-4111-8111-111111111111';
const M1 = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const base = { conversationId: C1, messageId: M1, userId: ME, emoji: '👍' };
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(async () => {
    vi.clearAllMocks();
    await db.sync_queue.clear();
    setOnline(true);
});

describe('chatReactionsService.toggle', () => {
    it('online: adds and removes on the server right away', async () => {
        addReaction.mockResolvedValue(undefined);
        removeReaction.mockResolvedValue(undefined);
        expect(await chatReactionsService.toggle({ ...base, remove: false })).toBe('saved');
        expect(addReaction).toHaveBeenCalledWith(M1, '👍');
        expect(await chatReactionsService.toggle({ ...base, remove: true })).toBe('saved');
        expect(removeReaction).toHaveBeenCalledWith(M1, ME, '👍');
        expect(addToQueue).not.toHaveBeenCalled();
    });

    it('offline: goes to the offline queue with everything the processor needs', async () => {
        setOnline(false);
        expect(await chatReactionsService.toggle({ ...base, remove: false })).toBe('queued');
        expect(addReaction).not.toHaveBeenCalled();
        expect(addToQueue).toHaveBeenCalledWith('CHAT_REACTION', { op: 'add', conversation_id: C1, message_id: M1, user_id: ME, emoji: '👍' });
        expect(await chatReactionsService.pendingFor(C1)).toEqual([{ op: 'add', message_id: M1, user_id: ME, emoji: '👍' }]);
        expect(await chatReactionsService.pendingFor('other')).toEqual([]);
    });

    it('a network failure while online also queues it', async () => {
        addReaction.mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await chatReactionsService.toggle({ ...base, remove: false })).toBe('queued');
        expect(addToQueue).toHaveBeenCalledTimes(1);
    });

    it('adding and removing the same reaction offline cancel out (nothing is sent)', async () => {
        setOnline(false);
        await chatReactionsService.toggle({ ...base, remove: false });
        expect(await db.sync_queue.count()).toBe(1);
        expect(await chatReactionsService.toggle({ ...base, remove: true })).toBe('queued');
        expect(await db.sync_queue.count()).toBe(0);
        expect(removeReaction).not.toHaveBeenCalled();
    });

    it('a rejection from the server is thrown (the screen undoes it), not queued', async () => {
        addReaction.mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
        await expect(chatReactionsService.toggle({ ...base, remove: false })).rejects.toMatchObject({ code: '42501' });
        expect(addToQueue).not.toHaveBeenCalled();
    });
});

describe('chatReactionsService.list', () => {
    it('reads the saved reactions of the messages', async () => {
        getReactions.mockResolvedValue([{ message_id: M1, user_id: ME, emoji: '👍' }]);
        expect(await chatReactionsService.list([M1])).toHaveLength(1);
        expect(getReactions).toHaveBeenCalledWith([M1]);
    });
});
