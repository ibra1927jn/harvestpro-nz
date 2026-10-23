// @vitest-environment node
/**
 * Reparto de la bandeja push (send-push flush) y texto de los avisos.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushOutbox, retryDelayMs, type OutboxRow, type OutboxStore, type OutboxSubscription, type PushRecipient } from './push-outbox.ts';
import { pushLocale, renderPush, roleHome } from './push-messages.ts';

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:test@example.test' };

function sub(user: string, endpoint: string, muted: string[] = []): OutboxSubscription {
  return { user_id: user, endpoint, keys_p256dh: 'k', keys_auth: 'a', muted_types: muted };
}

function memoryStore(rows: OutboxRow[], people: PushRecipient[], subs: OutboxSubscription[]) {
  const pending = [...rows];
  const sent = new Map<string, string | null>();
  const retries = new Map<string, { at: Date; error: string }>();
  const deleted: string[] = [];
  const store: OutboxStore = {
    claim: vi.fn(async (limit: number) => pending.splice(0, limit)),
    recipients: async ids => people.filter(p => ids.includes(p.id)),
    subscriptions: async ids => subs.filter(s => ids.includes(s.user_id) && !deleted.includes(s.endpoint)),
    markSent: async (id, note) => { sent.set(id, note); },
    markRetry: async (id, at, error) => { retries.set(id, { at, error }); },
    deleteSubscriptions: async endpoints => { deleted.push(...endpoints); },
  };
  return { store, sent, retries, deleted };
}

const row = (id: string, recipient: string, type: OutboxRow['type'], params: Record<string, unknown> = {}, attempts = 1): OutboxRow =>
  ({ id, recipient_id: recipient, type, params, url: null, attempts });

describe('flushOutbox', () => {
  const people: PushRecipient[] = [
    { id: 'tl', role: 'team_leader', preferred_locale: 'es', is_active: true },
    { id: 'lg', role: 'logistics', preferred_locale: null, is_active: true },
    { id: 'gone', role: 'runner', preferred_locale: 'en', is_active: false },
  ];

  it('delivers in the recipient language to the role home, skipping muted devices', async () => {
    const { store, sent } = memoryStore(
      [row('1', 'tl', 'qc_reject', { picker_name: 'Ana', grade: 'reject', row: 4 })],
      people,
      [sub('tl', 'https://push/a'), sub('tl', 'https://push/b', ['transport'])],
    );
    const send = vi.fn().mockResolvedValue({ success: true, statusCode: 201 });
    const r = await flushOutbox(store, vapid, { send });
    expect(r).toMatchObject({ claimed: 1, delivered: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    const payload = send.mock.calls[0][1];
    expect(payload).toMatchObject({ title: 'QC: Ana', url: '/team-leader', type: 'qc_reject' });
    expect(payload.body).toContain('rechazada');
    expect(sent.get('1')).toBeNull();
  });

  it('respects the per-device preference for that kind of notice', async () => {
    const { store, sent } = memoryStore(
      [row('1', 'lg', 'transport_new', { zone: 'Z1', bins: 2, requester_name: 'Tama' })],
      people,
      [sub('lg', 'https://push/c', ['transport'])],
    );
    const send = vi.fn();
    const r = await flushOutbox(store, vapid, { send });
    expect(send).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(sent.get('1')).toBe('muted');
  });

  it('never sends to a deactivated account', async () => {
    const { store, sent } = memoryStore([row('1', 'gone', 'broadcast', { title: 'x' })], people, [sub('gone', 'https://push/d')]);
    const send = vi.fn();
    await flushOutbox(store, vapid, { send });
    expect(send).not.toHaveBeenCalled();
    expect(sent.get('1')).toBe('recipient inactive');
  });

  it('removes expired subscriptions (404/410) and does not retry', async () => {
    const { store, sent, deleted, retries } = memoryStore([row('1', 'tl', 'broadcast', { title: 'Rain' })], people, [sub('tl', 'https://push/old')]);
    const send = vi.fn().mockResolvedValue({ success: false, statusCode: 410 });
    const r = await flushOutbox(store, vapid, { send });
    expect(deleted).toEqual(['https://push/old']);
    expect(r.expired).toBe(1);
    expect(retries.size).toBe(0);
    expect(sent.get('1')).toBe('all subscriptions expired');
  });

  it('retries later when the push service fails for a passing reason', async () => {
    const now = new Date('2026-10-23T01:00:00Z');
    const { store, retries, sent } = memoryStore([row('1', 'tl', 'broadcast', { title: 'Rain' }, 3)], people, [sub('tl', 'https://push/a')]);
    const send = vi.fn().mockResolvedValue({ success: false, statusCode: 503, error: 'Push service returned 503' });
    const r = await flushOutbox(store, vapid, { send, now: () => now });
    expect(r.retried).toBe(1);
    expect(sent.has('1')).toBe(false);
    expect(retries.get('1')).toEqual({ at: new Date(now.getTime() + 4 * 60_000), error: 'Push service returned 503' });
  });

  it('works through several batches and stops when the outbox is empty', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(String(i), 'tl', 'broadcast', { title: 't' }));
    const { store } = memoryStore(rows, people, [sub('tl', 'https://push/a')]);
    const send = vi.fn().mockResolvedValue({ success: true, statusCode: 201 });
    const r = await flushOutbox(store, vapid, { send, batchSize: 2 });
    expect(r.delivered).toBe(5);
    expect(store.claim).toHaveBeenCalledTimes(3);
  });
});

describe('retryDelayMs', () => {
  it('waits longer each attempt, up to 30 minutes', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(9)).toBe(30 * 60_000);
  });
});

describe('push messages', () => {
  it('never shows the text of a private message', () => {
    for (const locale of ['en', 'es', 'fr'] as const) {
      const out = renderPush('chat_message', { sender_name: 'Mere', conversation_type: 'direct', preview: 'secret' }, locale);
      expect(out.body).toContain('Mere');
      expect(out.body).not.toContain('secret');
    }
  });

  it('shows the group message preview', () => {
    expect(renderPush('chat_message', { sender_name: 'Mere', conversation_type: 'group', conversation_name: 'Block 3', preview: 'Lunch at 12' }, 'en'))
      .toEqual({ title: 'Block 3', body: 'Mere: Lunch at 12' });
  });

  it('uses French typography (no-break space before the colon)', () => {
    expect(renderPush('qc_reject', { picker_name: 'Ana', grade: 'reject' }, 'fr').title).toBe('QC\u00a0: Ana');
  });

  it('falls back to English and to the root for unknown locales and roles', () => {
    expect(pushLocale('mi')).toBe('en');
    expect(pushLocale('es-NZ')).toBe('es');
    expect(roleHome(undefined)).toBe('/');
    expect(roleHome('payroll_admin')).toBe('/payroll');
  });

  it('writes every kind of notice in every language', () => {
    const types = ['qc_reject', 'broadcast', 'transport_new', 'transport_assigned', 'transport_completed', 'timesheet_rejected', 'leave_decided', 'chat_message'] as const;
    for (const type of types) {
      for (const locale of ['en', 'es', 'fr'] as const) {
        const out = renderPush(type, { picker_name: 'A', title: 'T', zone: 'Z', status: 'approved', date: '2026-10-23', sender_name: 'S' }, locale);
        expect(out.title.length).toBeGreaterThan(0);
      }
    }
  });
});
