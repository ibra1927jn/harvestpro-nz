import { describe, it, expect } from 'vitest';
import { mergeOutbox } from './messagingOutbox';
import type { DBMessage } from './messaging.types';
import type { OutboxMessage } from '@/services/message-outbox.service';

const server = (id: string, at: string): DBMessage => ({
    id, sender_id: 'me', conversation_id: 'c1', content: `srv ${id}`, priority: 'normal', read_by: [], created_at: at,
});
const queued = (id: string, at: string, status: OutboxMessage['status'], reason?: string): OutboxMessage => ({
    id, channel_type: 'direct', recipient_id: 'c1', sender_id: 'me', content: `out ${id}`, timestamp: at,
    synced: status === 'failed' ? -1 : 0, status, ...(reason ? { failure_reason: reason } : {}),
});

describe('mergeOutbox', () => {
    it('shows own unsent messages in date order, marked pending or failed with the reason', () => {
        const merged = mergeOutbox(
            [server('a', '2026-10-13T10:00:00+13:00'), server('c', '2026-10-13T10:02:00+13:00')],
            [queued('b', '2026-10-13T10:01:00+13:00', 'failed', 'row-level security'), queued('d', '2026-10-13T10:03:00+13:00', 'pending')]
        );
        expect(merged.map(m => [m.id, m.delivery ?? 'sent'])).toEqual([['a', 'sent'], ['b', 'failed'], ['c', 'sent'], ['d', 'pending']]);
        expect(merged[1].failure_reason).toBe('row-level security');
        expect(merged[1].content).toBe('out b');
    });

    it('a message already on the server is shown once, as delivered (lost response)', () => {
        const merged = mergeOutbox([server('a', '2026-10-13T10:00:00+13:00')], [queued('a', '2026-10-13T10:00:00+13:00', 'pending')]);
        expect(merged).toHaveLength(1);
        expect(merged[0].delivery).toBeUndefined();
    });
});
