/**
 * simple-messaging.service — wrapper thin sobre messaging+user repos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messagingRepository } from '@/repositories/messaging.repository';
import { userRepository2 } from '@/repositories/user.repository';
import { simpleMessagingService } from './simple-messaging.service';
import { logger } from '@/utils/logger';

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('simpleMessagingService.sendMessage', () => {
    it('delega en messagingRepository.sendMessage', async () => {
        const spy = vi.spyOn(messagingRepository, 'sendMessage').mockResolvedValue({ id: 'm1' } as never);
        const res = await simpleMessagingService.sendMessage('conv1', 'sender1', 'hello');
        expect(spy).toHaveBeenCalledWith('conv1', 'sender1', 'hello');
        expect((res as { id: string })?.id).toBe('m1');
    });
});

describe('simpleMessagingService.getMessages', () => {
    it('mapea rows al shape ChatMessage y saca sender_name desde sender.full_name', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue([
            {
                id: 'm1',
                conversation_id: 'c1',
                sender_id: 's1',
                content: 'hola',
                created_at: '2026-04-18T09:00:00Z',
                sender: { full_name: 'Alice' },
            },
        ] as never);
        const msgs = await simpleMessagingService.getMessages('c1');
        expect(msgs).toHaveLength(1);
        expect(msgs[0].sender_name).toBe('Alice');
        expect(msgs[0].content).toBe('hola');
    });

    it('fallback a "Unknown" cuando sender.full_name ausente', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue([
            { id: 'm1', conversation_id: 'c1', sender_id: 's1', content: 'x', created_at: 'now' },
        ] as never);
        const [msg] = await simpleMessagingService.getMessages('c1');
        expect(msg.sender_name).toBe('Unknown');
    });

    it('devuelve [] cuando repo devuelve null/undefined', async () => {
        vi.spyOn(messagingRepository, 'getMessages').mockResolvedValue(null as never);
        expect(await simpleMessagingService.getMessages('c1')).toEqual([]);
    });
});

describe('simpleMessagingService.subscribeToConversation', () => {
    it('forwardea payloads del repo al callback del caller', () => {
        let subscribeCb: ((p: unknown) => void) | null = null;
        vi.spyOn(messagingRepository, 'subscribe').mockImplementation((_id, cb) => {
            subscribeCb = cb as (p: unknown) => void;
            return { unsubscribe: () => {} } as never;
        });
        const onMessage = vi.fn();
        simpleMessagingService.subscribeToConversation('c1', onMessage);
        subscribeCb?.({ id: 'm1', content: 'real-time' });
        expect(onMessage).toHaveBeenCalledWith({ id: 'm1', content: 'real-time' });
    });
});

describe('simpleMessagingService.getConversations', () => {
    it('devuelve [] y loguea warn cuando el repo tira', async () => {
        vi.spyOn(messagingRepository, 'getConversations').mockRejectedValue(new Error('db down'));
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const res = await simpleMessagingService.getConversations('u1');
        expect(res).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('devuelve data cast a Conversation[]', async () => {
        vi.spyOn(messagingRepository, 'getConversations').mockResolvedValue([
            { id: 'c1', type: 'direct', participant_ids: ['a', 'b'], updated_at: '2026-04-18' },
        ] as never);
        const res = await simpleMessagingService.getConversations('u1');
        expect(res).toHaveLength(1);
        expect(res[0].type).toBe('direct');
    });
});

describe('simpleMessagingService.getUsers', () => {
    it('mapea users a {id, name, role}; solo cuentas activas con chat', async () => {
        vi.spyOn(userRepository2, 'getAll').mockResolvedValue([
            { id: 'u1', full_name: 'Alice', role: 'qc_inspector' },
            { id: 'u2', full_name: null, role: 'payroll_admin', is_active: true },
            { id: 'u3', full_name: 'Gone', role: 'manager', is_active: false },
            { id: 'u4', full_name: 'Picker', role: 'picker' },
            { id: 'u5', full_name: 'No role', role: null },
        ] as never);
        const users = await simpleMessagingService.getUsers();
        expect(users).toEqual([
            { id: 'u1', name: 'Alice', role: 'qc_inspector' },
            { id: 'u2', name: 'Unknown', role: 'payroll_admin' },
        ]);
    });

    it('getDirectory: nombres de todas las cuentas (también dadas de baja)', async () => {
        vi.spyOn(userRepository2, 'getAll').mockResolvedValue([
            { id: 'u1', full_name: 'Alice', role: 'runner' },
            { id: 'u3', full_name: 'Gone', role: 'manager', is_active: false },
        ] as never);
        const d = await simpleMessagingService.getDirectory();
        expect(d.contacts.map(c => c.id)).toEqual(['u1']);
        expect(d.names).toEqual({ u1: 'Alice', u3: 'Gone' });
    });
});

describe('simpleMessagingService.createConversation', () => {
    it('forwardea al repo con los 4 args', async () => {
        const spy = vi.spyOn(messagingRepository, 'createConversation').mockResolvedValue({ id: 'c1' } as never);
        await simpleMessagingService.createConversation('group', ['a', 'b'], 'admin1', 'Team A');
        expect(spy).toHaveBeenCalledWith('group', ['a', 'b'], 'admin1', 'Team A');
    });
});
