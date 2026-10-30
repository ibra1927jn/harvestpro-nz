/**
 * Reacciones del chat: lógica pura (sin red ni IndexedDB).
 * El conjunto de emojis es el mismo que el CHECK de chat_message_reactions
 * (migración 20261023070000): si se cambia aquí, hace falta otra migración.
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const isReactionEmoji = (e: string): e is ReactionEmoji =>
    (REACTION_EMOJIS as readonly string[]).includes(e);

/** Una reacción: persona, mensaje y emoji (como la clave de la tabla) */
export interface ReactionKey {
    message_id: string;
    user_id: string;
    emoji: string;
}

/** Cambio de una reacción (aviso en vivo o pendiente en la cola) */
export interface ReactionChange extends ReactionKey {
    op: 'add' | 'remove';
}

/** Lo que enseña la burbuja: emoji, cuántos, si está el mío y quiénes */
export interface ReactionSummary {
    emoji: string;
    count: number;
    mine: boolean;
    userIds: string[];
}

const sameKey = (a: ReactionKey, b: ReactionKey) =>
    a.message_id === b.message_id && a.user_id === b.user_id && a.emoji === b.emoji;

/** Aplica un cambio. Idempotente: el mismo aviso dos veces no cuenta doble. */
export function applyReactionChange<T extends ReactionKey>(rows: T[], change: ReactionChange): ReactionKey[] {
    const without = rows.filter(r => !sameKey(r, change));
    if (change.op === 'remove') return without.length === rows.length ? rows : without;
    if (without.length !== rows.length) return rows;
    return [...rows, { message_id: change.message_id, user_id: change.user_id, emoji: change.emoji }];
}

/** Aplica en orden los cambios que siguen en la cola de este móvil */
export function withPendingChanges(rows: ReactionKey[], pending: ReactionChange[]): ReactionKey[] {
    return pending.reduce<ReactionKey[]>((acc, c) => applyReactionChange(acc, c), rows);
}

/** ¿Tengo puesta esta reacción? */
export function hasReaction(rows: ReactionKey[], messageId: string, userId: string, emoji: string): boolean {
    return rows.some(r => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
}

/** Por mensaje, las reacciones agrupadas por emoji en el orden del selector */
export function summarizeReactions(rows: ReactionKey[], me: string): Record<string, ReactionSummary[]> {
    const byMsg = new Map<string, Map<string, string[]>>();
    for (const r of rows) {
        const perEmoji = byMsg.get(r.message_id) ?? new Map<string, string[]>();
        const users = perEmoji.get(r.emoji) ?? [];
        if (!users.includes(r.user_id)) users.push(r.user_id);
        perEmoji.set(r.emoji, users);
        byMsg.set(r.message_id, perEmoji);
    }
    const order = (e: string) => {
        const i = (REACTION_EMOJIS as readonly string[]).indexOf(e);
        return i === -1 ? REACTION_EMOJIS.length : i;
    };
    const out: Record<string, ReactionSummary[]> = {};
    for (const [msgId, perEmoji] of byMsg) {
        out[msgId] = [...perEmoji.entries()]
            .sort((a, b) => order(a[0]) - order(b[0]))
            .map(([emoji, userIds]) => ({ emoji, count: userIds.length, mine: userIds.includes(me), userIds }));
    }
    return out;
}
