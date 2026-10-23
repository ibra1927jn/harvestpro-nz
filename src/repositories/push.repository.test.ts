/**
 * push.repository — alta por RPC (un dispositivo = una cuenta), baja y tipos silenciados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const update = vi.fn((_: unknown) => ({ eq }));
const from = vi.fn((_: string) => ({ delete: del, update }));

vi.mock('@/services/supabase', () => ({
    supabase: {
        rpc: (...a: unknown[]) => rpc(...a),
        from: (t: string) => from(t),
    },
}));

import { pushRepository } from './push.repository';

describe('pushRepository', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpc.mockResolvedValue({ error: null });
        eq.mockResolvedValue({ error: null });
    });

    it('registers the device through register_push_subscription', async () => {
        const res = await pushRepository.register({
            endpoint: 'https://push.example.com/1', keys_p256dh: 'p', keys_auth: 'a', user_agent: 'UA', muted_types: ['transport'],
        });
        expect(res.error).toBeNull();
        expect(rpc).toHaveBeenCalledWith('register_push_subscription', {
            p_endpoint: 'https://push.example.com/1', p_p256dh: 'p', p_auth: 'a', p_user_agent: 'UA', p_muted_types: ['transport'],
        });
    });

    it('returns the server error message', async () => {
        rpc.mockResolvedValue({ error: { message: 'Invalid push endpoint' } });
        const res = await pushRepository.register({ endpoint: 'x', keys_p256dh: 'p', keys_auth: 'a', user_agent: '', muted_types: [] });
        expect(res.error?.message).toBe('Invalid push endpoint');
    });

    it('deletes the subscription of this device by endpoint', async () => {
        await pushRepository.delete('https://push.example.com/1');
        expect(from).toHaveBeenCalledWith('push_subscriptions');
        expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example.com/1');
    });

    it('saves the muted notification types of this device', async () => {
        await pushRepository.setMutedTypes('https://push.example.com/1', ['qc_reject']);
        expect(update.mock.calls[0][0]).toMatchObject({ muted_types: ['qc_reject'] });
        expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example.com/1');
    });
});
