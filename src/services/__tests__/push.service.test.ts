/**
 * push.service — suscripción push de este dispositivo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const register = vi.fn();
const remove = vi.fn();
const setMuted = vi.fn();
vi.mock('@/repositories/push.repository', () => ({
    pushRepository: {
        register: (...a: unknown[]) => register(...a),
        delete: (...a: unknown[]) => remove(...a),
        setMutedTypes: (...a: unknown[]) => setMuted(...a),
    },
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

interface FakeSub { endpoint: string; toJSON: () => PushSubscriptionJSON; unsubscribe: ReturnType<typeof vi.fn> }
const makeSub = (endpoint: string): FakeSub => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
});

let current: FakeSub | null;
const subscribe = vi.fn();

function installBrowser(opts: { ua?: string; permission?: NotificationPermission } = {}) {
    Object.defineProperty(navigator, 'userAgent', { value: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130', configurable: true });
    const registration = {
        pushManager: {
            getSubscription: vi.fn(async () => current),
            subscribe: subscribe.mockImplementation(async () => { current = makeSub('https://push.example.com/new'); return current; }),
        },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve(registration), addEventListener: vi.fn() },
        configurable: true,
    });
    Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
    Object.defineProperty(window, 'Notification', {
        value: { permission: opts.permission ?? 'granted', requestPermission: vi.fn() },
        configurable: true, writable: true,
    });
}

async function load() {
    vi.resetModules();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID);
    return (await import('../push.service')).pushService;
}

describe('pushService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        current = null;
        register.mockResolvedValue({ error: null });
        remove.mockResolvedValue({ error: null });
        setMuted.mockResolvedValue({ error: null });
        installBrowser();
    });
    afterEach(() => vi.unstubAllEnvs());

    it('enable() subscribes with the VAPID key and stores one row for this device', async () => {
        const push = await load();
        expect(await push.enable(['transport'])).toEqual({ ok: true });
        expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
        expect(register).toHaveBeenCalledWith(expect.objectContaining({
            endpoint: 'https://push.example.com/new', keys_p256dh: 'p256dh-key', keys_auth: 'auth-key', muted_types: ['transport'],
        }));
        expect(push.isRegistered()).toBe(true);
    });

    it('enable() without permission does nothing', async () => {
        installBrowser({ permission: 'denied' });
        const push = await load();
        expect(await push.enable([])).toEqual({ ok: false, reason: 'denied' });
        expect(register).not.toHaveBeenCalled();
    });

    it('on iPhone outside the installed app, says it needs installing', async () => {
        installBrowser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' });
        const push = await load();
        expect(push.unavailableReason()).toBe('ios_needs_install');
        expect(await push.enable([])).toEqual({ ok: false, reason: 'ios_needs_install' });
    });

    it('without VAPID key it is not configured', async () => {
        vi.resetModules();
        vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
        const push = (await import('../push.service')).pushService;
        expect(push.unavailableReason()).toBe('not_configured');
    });

    it('resync() replaces a subscription the browser changed (and deletes the old row)', async () => {
        const push = await load();
        localStorage.setItem('harvestpro_push_endpoint', 'https://push.example.com/old');
        current = makeSub('https://push.example.com/renewed');
        await push.resync([]);
        expect(register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example.com/renewed' }));
        expect(remove).toHaveBeenCalledWith('https://push.example.com/old');
        expect(subscribe).not.toHaveBeenCalled();
    });

    it('disable() deletes the row and unsubscribes the browser', async () => {
        const push = await load();
        current = makeSub('https://push.example.com/a');
        localStorage.setItem('harvestpro_push_endpoint', 'https://push.example.com/a');
        const sub = current;
        await push.disable();
        expect(remove).toHaveBeenCalledWith('https://push.example.com/a');
        expect(sub.unsubscribe).toHaveBeenCalled();
        expect(push.isRegistered()).toBe(false);
    });

    it('forgetDevice() on sign-out deletes the row of this device', async () => {
        const push = await load();
        localStorage.setItem('harvestpro_push_endpoint', 'https://push.example.com/a');
        await push.forgetDevice();
        expect(remove).toHaveBeenCalledWith('https://push.example.com/a');
    });

    it('setMutedTypes() updates this device', async () => {
        const push = await load();
        localStorage.setItem('harvestpro_push_endpoint', 'https://push.example.com/a');
        await push.setMutedTypes(['qc_reject']);
        expect(setMuted).toHaveBeenCalledWith('https://push.example.com/a', ['qc_reject']);
    });
});
