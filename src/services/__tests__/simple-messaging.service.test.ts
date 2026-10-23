import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase at the root (repos import this at load time) ──
vi.mock('@/services/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            contains: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnValue({ data: null, error: null }),
        })),
        channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
        removeChannel: vi.fn(),
    },
}));
vi.mock('@/utils/nzst', () => ({ nowNZST: () => '2026-02-14T10:00:00+13:00' }));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Now import repos and service — supabase is already mocked
import { messagingRepository } from '@/repositories/messaging.repository';
import { userRepository2 } from '@/repositories/user.repository';
import { simpleMessagingService } from '../simple-messaging.service';

describe('simpleMessagingService', () => {
    beforeEach(() => vi.restoreAllMocks());

    // ═══════════════════════════════════════
    // sendMessage
    // ═══════════════════════════════════════

    it('sendMessage delegates to messagingRepository', async () => {
        vi.spyOn(messagingRepository, 'sendMessage').mockResolvedValue({ id: 'msg-1', conversation_id: 'conv-1', sender_id: 'user-1', content: 'Hello', created_at: '2026-01-01' });

        const result = await simpleMessagingService.sendMessage('conv-1', 'user-1', 'Hello');

        expect(messagingRepository.sendMessage).toHaveBeenCalledWith('conv-1', 'user-1', 'Hello');
        expect(result).toEqual(expect.objectContaining({ id: 'msg-1' }));
    });

    // ═══════════════════════════════════════
    // getMessages
    // ═══════════════════════════════════════

    it('getMessages maps raw data to ChatMessage format', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue([
            { id: 'm1', conversation_id: 'c1', sender_id: 's1', content: 'Hi', created_at: '2026-01-01', sender: { full_name: 'Alice' } },
        ] as never);

        const result = await simpleMessagingService.getMessages('c1');

        expect(result).toHaveLength(1);
        expect(result[0].sender_name).toBe('Alice');
        expect(result[0].content).toBe('Hi');
    });

    it('getMessages returns empty array when data is null', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue(null as never);

        const result = await simpleMessagingService.getMessages('c1');
        expect(result).toEqual([]);
    });

    it('getMessages uses "Unknown" when sender has no full_name', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue([
            { id: 'm1', conversation_id: 'c1', sender_id: 's1', content: 'X', created_at: '2026-01-01', sender: null },
        ] as never);

        const result = await simpleMessagingService.getMessages('c1');
        expect(result[0].sender_name).toBe('Unknown');
    });

    // ═══════════════════════════════════════
    // getConversations
    // ═══════════════════════════════════════

    it('getConversations returns conversations on success', async () => {
        const convos = [{ id: 'c1', type: 'direct' as const, participant_ids: ['u1', 'u2'], updated_at: '2026-01-01' }];
        vi.spyOn(messagingRepository, 'getConversations').mockResolvedValue(convos as never);

        const result = await simpleMessagingService.getConversations('u1');
        expect(result).toEqual(convos);
    });

    it('getConversations returns empty array on error (fail-safe)', async () => {
        vi.spyOn(messagingRepository, 'getConversations').mockRejectedValue(new Error('Network'));

        const result = await simpleMessagingService.getConversations('u1');
        expect(result).toEqual([]);
    });

    // ═══════════════════════════════════════
    // getUsers
    // ═══════════════════════════════════════

    it('getUsers maps user records to simplified format', async () => {
        vi.spyOn(userRepository2, 'getAll').mockResolvedValue([
            { id: 'u1', full_name: 'Alice', role: 'manager' },
            { id: 'u2', full_name: null, role: 'logistics' },
            { id: 'u3', full_name: 'Inactive', role: 'hr_admin', is_active: false },
        ] as never);

        const result = await simpleMessagingService.getUsers();

        expect(result).toEqual([
            { id: 'u1', name: 'Alice', role: 'manager' },
            { id: 'u2', name: 'Unknown', role: 'logistics' },
        ]);
    });

    // ═══════════════════════════════════════
    // createConversation
    // ═══════════════════════════════════════

    it('createConversation delegates to messagingRepository', async () => {
        vi.spyOn(messagingRepository, 'createConversation').mockResolvedValue({ id: 'conv-new', type: 'group' } as never);

        const result = await simpleMessagingService.createConversation('group', ['u1', 'u2'], 'u1', 'Team Chat');

        expect(messagingRepository.createConversation).toHaveBeenCalledWith('group', ['u1', 'u2'], 'u1', 'Team Chat');
        expect(result).toEqual({ id: 'conv-new', type: 'group' });
    });
});

