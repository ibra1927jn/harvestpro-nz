/**
 * Cola offline, tipo CHAT_REACTION: procesador y despachador (con su esquema Zod).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addReaction = vi.fn();
const removeReaction = vi.fn();
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        addReaction: (...a: unknown[]) => addReaction(...a),
        removeReaction: (...a: unknown[]) => removeReaction(...a),
    },
}));

import { processChatReaction } from './chat-reaction.processor';
import { dispatchSyncItem } from '../sync-queue/dispatchItem';
import * as schemas from '../sync.schemas';
import type { QueuedSyncItem } from '../db';

const payload = {
    op: 'add' as const,
    conversation_id: '11111111-1111-4111-8111-111111111111',
    message_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    emoji: '👍',
};
const item = (p: Record<string, unknown>): QueuedSyncItem => ({ id: 'q1', type: 'CHAT_REACTION', payload: p, timestamp: 1, retryCount: 0 });

beforeEach(() => {
    vi.clearAllMocks();
    addReaction.mockResolvedValue(undefined);
    removeReaction.mockResolvedValue(undefined);
});

describe('processChatReaction', () => {
    it('adds or removes the reaction', async () => {
        await processChatReaction(payload);
        expect(addReaction).toHaveBeenCalledWith(payload.message_id, '👍');
        await processChatReaction({ ...payload, op: 'remove' });
        expect(removeReaction).toHaveBeenCalledWith(payload.message_id, payload.user_id, '👍');
    });

    it('a message deleted meanwhile is not an error (nothing to react to)', async () => {
        addReaction.mockRejectedValue({ code: '23503', message: 'Message does not exist' });
        await expect(processChatReaction(payload)).resolves.toBeUndefined();
    });

    it('other rejections are thrown so the queue retries / dead-letters them', async () => {
        addReaction.mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
        await expect(processChatReaction(payload)).rejects.toThrow(/Chat reaction not saved/);
    });
});

describe('dispatchSyncItem CHAT_REACTION', () => {
    it('validates and sends a queued reaction', async () => {
        expect(await dispatchSyncItem(item(payload), schemas)).toBe(true);
        expect(addReaction).toHaveBeenCalledTimes(1);
    });

    it('rejects an emoji outside the short set without calling the server', async () => {
        await expect(dispatchSyncItem(item({ ...payload, emoji: '💩' }), schemas)).rejects.toMatchObject({ name: 'ZodError' });
        await expect(dispatchSyncItem(item({ ...payload, message_id: 'x' }), schemas)).rejects.toMatchObject({ name: 'ZodError' });
        expect(addReaction).not.toHaveBeenCalled();
    });
});
