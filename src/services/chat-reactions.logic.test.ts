/**
 * Reacciones del chat: lógica pura (agrupar, aplicar avisos, pendientes de la cola).
 */
import { describe, it, expect } from 'vitest';
import {
    REACTION_EMOJIS,
    applyReactionChange,
    hasReaction,
    isReactionEmoji,
    summarizeReactions,
    withPendingChanges,
    type ReactionKey,
} from './chat-reactions.logic';

const r = (message_id: string, user_id: string, emoji: string): ReactionKey => ({ message_id, user_id, emoji });

describe('chat reactions logic', () => {
    it('the emoji set matches the database CHECK (6 short emojis)', () => {
        expect([...REACTION_EMOJIS]).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏']);
        expect(isReactionEmoji('👍')).toBe(true);
        expect(isReactionEmoji('💩')).toBe(false);
    });

    it('adding is idempotent: the same live event twice counts once', () => {
        const once = applyReactionChange([], { op: 'add', ...r('m1', 'u1', '👍') });
        const twice = applyReactionChange(once, { op: 'add', ...r('m1', 'u1', '👍') });
        expect(twice).toEqual([r('m1', 'u1', '👍')]);
        expect(twice).toBe(once);
    });

    it('removing only drops that person, message and emoji', () => {
        const rows = [r('m1', 'u1', '👍'), r('m1', 'u2', '👍'), r('m1', 'u1', '❤️')];
        expect(applyReactionChange(rows, { op: 'remove', ...r('m1', 'u1', '👍') })).toEqual([r('m1', 'u2', '👍'), r('m1', 'u1', '❤️')]);
        // Quitar lo que no está no cambia nada
        expect(applyReactionChange(rows, { op: 'remove', ...r('m2', 'u1', '👍') })).toBe(rows);
    });

    it('applies the changes still queued on this phone in order', () => {
        const server = [r('m1', 'u2', '😂')];
        const out = withPendingChanges(server, [
            { op: 'add', ...r('m1', 'me', '👍') },
            { op: 'remove', ...r('m1', 'u2', '😂') },
        ]);
        expect(out).toEqual([r('m1', 'me', '👍')]);
        expect(hasReaction(out, 'm1', 'me', '👍')).toBe(true);
        expect(hasReaction(out, 'm1', 'me', '😂')).toBe(false);
    });

    it('summarises per message, in the picker order, with my own marked', () => {
        const rows = [r('m1', 'u2', '🙏'), r('m1', 'me', '👍'), r('m1', 'u2', '👍'), r('m2', 'u3', '😮')];
        const s = summarizeReactions(rows, 'me');
        expect(s.m1).toEqual([
            { emoji: '👍', count: 2, mine: true, userIds: ['me', 'u2'] },
            { emoji: '🙏', count: 1, mine: false, userIds: ['u2'] },
        ]);
        expect(s.m2).toEqual([{ emoji: '😮', count: 1, mine: false, userIds: ['u3'] }]);
        expect(s.m3).toBeUndefined();
    });
});
