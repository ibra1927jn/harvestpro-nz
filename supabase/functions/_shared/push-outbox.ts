/**
 * push-outbox — Reparte la bandeja notification_outbox (send-push, modo flush).
 *
 * Por lote: coge pendientes (claim, sin solapes entre dos flush), carga a quién
 * van y sus dispositivos, quita los dispositivos que silenciaron ese tipo y
 * envía. Resultado por aviso:
 *   · entregado a algún dispositivo, o nada que hacer (cuenta desactivada, sin
 *     dispositivos o todos silenciados) → enviado (sent_at);
 *   · todos los envíos fallaron por algo pasajero (5xx, red) → reintento con
 *     espera creciente (claim_push_outbox deja de cogerlo a los 5 intentos);
 *   · dispositivo caducado (404/410) → se borra su suscripción.
 * El almacén va inyectado: Deno (send-push) y Vitest usan el mismo código.
 */
import { sendWebPush, type PushSubscriptionRow } from './web-push.ts';
import { MUTE_CATEGORY, pushLocale, renderPush, roleHome, type PushType, type PushParams } from './push-messages.ts';

export interface OutboxRow {
  id: string;
  recipient_id: string;
  type: PushType;
  params: PushParams | null;
  url: string | null;
  attempts: number;
}

export interface PushRecipient {
  id: string;
  role: string | null;
  preferred_locale: string | null;
  is_active: boolean | null;
}

export interface OutboxSubscription extends PushSubscriptionRow {
  user_id: string;
  muted_types: string[] | null;
}

export interface OutboxStore {
  claim(limit: number): Promise<OutboxRow[]>;
  recipients(ids: string[]): Promise<PushRecipient[]>;
  subscriptions(userIds: string[]): Promise<OutboxSubscription[]>;
  markSent(id: string, note: string | null): Promise<void>;
  markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  deleteSubscriptions(endpoints: string[]): Promise<void>;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface FlushResult {
  claimed: number;
  delivered: number;
  skipped: number;
  retried: number;
  expired: number;
}

/** Espera antes del siguiente intento: 1, 2, 4, 8 min… (máx. 30) */
export function retryDelayMs(attempts: number): number {
  return Math.min(30, 2 ** Math.max(0, attempts - 1)) * 60_000;
}

export async function flushOutbox(
  store: OutboxStore,
  vapid: VapidKeys,
  options: { batchSize?: number; maxBatches?: number; now?: () => Date; send?: typeof sendWebPush } = {},
): Promise<FlushResult> {
  const batchSize = options.batchSize ?? 100;
  const maxBatches = options.maxBatches ?? 5;
  const now = options.now ?? (() => new Date());
  const send = options.send ?? sendWebPush;
  const result: FlushResult = { claimed: 0, delivered: 0, skipped: 0, retried: 0, expired: 0 };

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await store.claim(batchSize);
    if (rows.length === 0) break;
    result.claimed += rows.length;

    const recipientIds = [...new Set(rows.map(r => r.recipient_id))];
    const people = new Map((await store.recipients(recipientIds)).map(p => [p.id, p]));
    const subsByUser = new Map<string, OutboxSubscription[]>();
    for (const s of await store.subscriptions(recipientIds)) {
      const list = subsByUser.get(s.user_id) ?? [];
      list.push(s);
      subsByUser.set(s.user_id, list);
    }
    const expired = new Set<string>();

    for (const row of rows) {
      const person = people.get(row.recipient_id);
      if (!person || person.is_active === false) {
        await store.markSent(row.id, 'recipient inactive');
        result.skipped++;
        continue;
      }
      const category = MUTE_CATEGORY[row.type] ?? null;
      const subs = (subsByUser.get(row.recipient_id) ?? [])
        .filter(s => !expired.has(s.endpoint))
        .filter(s => !category || !(s.muted_types ?? []).includes(category));
      if (subs.length === 0) {
        await store.markSent(row.id, category && (subsByUser.get(row.recipient_id) ?? []).length > 0 ? 'muted' : 'no subscription');
        result.skipped++;
        continue;
      }

      const { title, body } = renderPush(row.type, row.params ?? {}, pushLocale(person.preferred_locale));
      const payload = {
        title,
        body,
        url: row.url || roleHome(person.role),
        tag: `${row.type}-${row.id}`,
        type: row.type,
        timestamp: now().getTime(),
      };

      let ok = 0;
      let lastError = '';
      let transient = 0;
      for (const sub of subs) {
        const r = await send(sub, payload, vapid);
        if (r.success) ok++;
        else if (r.statusCode === 404 || r.statusCode === 410) expired.add(sub.endpoint);
        else {
          transient++;
          lastError = r.error ?? `status ${r.statusCode ?? '?'}`;
        }
      }

      if (ok > 0 || transient === 0) {
        await store.markSent(row.id, ok > 0 ? null : 'all subscriptions expired');
        if (ok > 0) result.delivered++;
        else result.skipped++;
      } else {
        await store.markRetry(row.id, new Date(now().getTime() + retryDelayMs(row.attempts)), lastError.slice(0, 300));
        result.retried++;
      }
    }

    if (expired.size > 0) {
      await store.deleteSubscriptions([...expired]);
      result.expired += expired.size;
    }
    if (rows.length < batchSize) break;
  }
  return result;
}
