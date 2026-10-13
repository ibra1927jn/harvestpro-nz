/**
 * Caos de la bandeja de salida de mensajes (cifrada de verdad): cortes, respuestas
 * perdidas, rechazos, recargas de la app con el móvil girado o Chrome
 * actualizado entre medias.
 *
 * Invariantes: cada mensaje llega exactamente una vez y con su texto (no el
 * cifrado), o queda apartado con motivo; tras volver la red no queda nada pendiente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

type Fault = 'ok' | 'network' | 'lostResponse' | 'rejected';

class FakeChat {
    delivered = new Map<string, string[]>();
    faults: Fault[] = [];
    async send(id: string, content: string): Promise<void> {
        await Promise.resolve();
        const fault = this.faults.shift() ?? 'ok';
        if (fault === 'network') throw new TypeError('Failed to fetch');
        if (fault === 'rejected') throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
        if (this.delivered.has(id)) throw Object.assign(new Error('duplicate key value violates unique constraint "chat_messages_pkey"'), { code: '23505' });
        this.delivered.set(id, [content]);
        if (fault === 'lostResponse') throw new TypeError('Failed to fetch');
    }
}
const chat = new FakeChat();

vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: (_conv: string, _sender: string, content: string, opts: { id: string }) => chat.send(opts.id, content),
        messageExists: async (id: string) => chat.delivered.has(id),
    },
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { db } from '../../db';
import { messageOutbox } from '../../message-outbox.service';
import { resetKeyCache } from '../../dbCrypto';

type Action =
    | { kind: 'write'; text: string }
    | { kind: 'flush'; faults: Fault[] }
    | { kind: 'retryFailed'; faults: Fault[] }
    | { kind: 'offline' }
    | { kind: 'online' }
    | { kind: 'reload'; rotate: boolean; chromeUpdate: boolean };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('write' as const), text: fc.string({ minLength: 1, maxLength: 40 }) }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('flush' as const), faults: fc.array(fc.constantFrom<Fault>('ok', 'network', 'lostResponse', 'rejected'), { maxLength: 3 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('retryFailed' as const), faults: fc.array(fc.constantFrom<Fault>('ok', 'network', 'lostResponse', 'rejected'), { maxLength: 2 }) }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'offline' as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'online' as const }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('reload' as const), rotate: fc.boolean(), chromeUpdate: fc.boolean() }) },
);

let online = true;
let screenW = 412;
let screenH = 915;
let chromeVersion = 129;

async function run(actions: Action[]): Promise<void> {
    const written = new Map<string, string>();
    let seq = 0;
    for (const a of actions) {
        switch (a.kind) {
            case 'write': {
                const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
                written.set(id, a.text);
                await messageOutbox.queue({
                    id, channel_type: 'direct', recipient_id: 'conv-1', sender_id: 'tl-1', content: a.text,
                    timestamp: new Date(Date.parse('2026-10-13T00:00:00Z') + seq * 1000).toISOString(),
                });
                break;
            }
            case 'flush':
                chat.faults.push(...a.faults);
                await messageOutbox.flush();
                break;
            case 'retryFailed': {
                // Quien escribió ve "Not sent" en la conversación y pulsa Retry
                chat.faults.push(...a.faults);
                const shown = await messageOutbox.forConversation('conv-1');
                for (const m of shown.filter(x => x.status === 'failed')) await messageOutbox.retry(m.id);
                break;
            }
            case 'offline': online = false; break;
            case 'online': online = true; break;
            case 'reload':
                // App muerta en segundo plano y reabierta (girada / Chrome actualizado)
                if (a.rotate) [screenW, screenH] = [screenH, screenW];
                if (a.chromeUpdate) chromeVersion++;
                resetKeyCache();
                break;
        }
    }
    online = true;
    chat.faults = [];
    for (let i = 0; i < 5 && (await messageOutbox.pendingCount()) > 0; i++) await messageOutbox.flush();
    expect(await messageOutbox.pendingCount()).toBe(0);

    // Lo que ve quien escribió en la conversación: lo no entregado sale como
    // "Not sent" con su texto y motivo (antes no se enseñaba: parecía enviado)
    const shown = new Map((await messageOutbox.forConversation('conv-1')).map(m => [m.id, m]));
    for (const [id, text] of written) {
        const got = chat.delivered.get(id);
        if (got) {
            expect(got, `message ${id} delivered with wrong content`).toEqual([text]);
            expect(shown.has(id), `message ${id} delivered but still shown as not sent`).toBe(false);
        } else {
            const m = shown.get(id);
            expect(m?.status, `message ${id} not delivered and not shown to the sender`).toBe('failed');
            expect(m?.failure_reason).toBeTruthy();
            expect(m?.content).toBe(text);
        }
    }
}

const RUNS = Number(process.env.CHAOS_RUNS ?? 25);
const SEED = process.env.CHAOS_SEED ? Number(process.env.CHAOS_SEED) : 20261013;

beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => `Mozilla/5.0 (Linux; Android 14) Chrome/${chromeVersion}.0.0.0 Mobile` });
    Object.defineProperty(screen, 'width', { configurable: true, get: () => screenW });
    Object.defineProperty(screen, 'height', { configurable: true, get: () => screenH });
});
afterEach(() => resetKeyCache());

describe('message outbox chaos', () => {
    it('a rejected message is shown to the sender as failed; Retry delivers it exactly once', async () => {
        await db.message_queue.clear();
        chat.delivered.clear();
        online = true;
        chat.faults = ['rejected'];
        await run([{ kind: 'write', text: 'bins at row 4' }, { kind: 'flush', faults: [] }]);
        const [m] = await messageOutbox.forConversation('conv-1');
        expect(m.status).toBe('failed');
        // Reintento con la respuesta perdida, y otro: llega una sola vez
        chat.faults = ['lostResponse'];
        await messageOutbox.retry(m.id);
        await messageOutbox.flush();
        expect(chat.delivered.get(m.id)).toEqual(['bins at row 4']);
        expect(await messageOutbox.forConversation('conv-1')).toEqual([]);
    });

    it(`exactly once, with its own text, or visibly failed (seed ${SEED}, ${RUNS} runs)`, async () => {
        await fc.assert(
            fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 25 }), async actions => {
                await db.message_queue.clear();
                chat.delivered.clear();
                chat.faults = [];
                online = true;
                await run(actions);
            }),
            { seed: SEED, numRuns: RUNS, endOnFailure: true }
        );
    }, Math.max(120_000, RUNS * 3_000));
});
