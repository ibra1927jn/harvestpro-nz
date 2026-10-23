import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handlePreflight,
  requireRole,
  errorResponse,
  jsonResponse,
  checkRateLimit,
} from '../_shared/security.ts';
import { z } from 'npm:zod@^4.3.6';
import { deliverToSubscriptions } from '../_shared/web-push.ts';
import { flushOutbox, type OutboxRow, type OutboxStore, type OutboxSubscription, type PushRecipient } from '../_shared/push-outbox.ts';
import { fetchInChunks } from '../_shared/fetch-in-chunks.ts';

/**
 * send-push — Entrega de notificaciones push (Web Push + VAPID).
 *
 * Acciones:
 *   · flush: reparte la bandeja notification_outbox (la rellenan los triggers de
 *     la base en los eventos). No lleva datos del mensaje: solo despierta la
 *     función. La llaman los clientes tras escribir algo que avisa, y pg_cron
 *     cada minuto (con la clave de servicio, ver push_outbox_tick).
 *   · test: un aviso de prueba a los dispositivos de quien llama.
 * Ya no hay «send_to_user» ni «broadcast» con texto libre: ningún cliente puede
 * mandar un push arbitrario a otra persona (antes un team leader podía).
 *
 * Secretos (supabase secrets set …):
 *   VAPID_PUBLIC_KEY  — clave pública P-256 en base64url (la misma que VITE_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY — clave privada PKCS#8 en base64url
 *   VAPID_SUBJECT     — mailto: o https: de quien envía
 * Ver docs/push-notifications.md.
 */

const PushInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('flush') }),
  z.object({
    action: z.literal('test'),
    title: z.string().max(200).optional(),
    body: z.string().max(500).optional(),
  }),
]);

const ALL_ROLES = [
  'admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics',
] as const;

function vapidFromEnv() {
  return {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@harvestpro.nz',
  };
}

/** pg_cron llama con la clave de servicio como Bearer */
function isServiceCaller(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const header = req.headers.get('Authorization') ?? '';
  return key.length > 0 && header === `Bearer ${key}`;
}

// deno-lint-ignore no-explicit-any
type Db = any;

function outboxStore(admin: Db): OutboxStore {
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc('claim_push_outbox', { p_limit: limit });
      if (error) throw new Error(`claim_push_outbox: ${error.message}`);
      return (data ?? []) as OutboxRow[];
    },
    recipients(ids) {
      return fetchInChunks<PushRecipient>(ids, (chunk, from, to) =>
        admin.from('users').select('id, role, preferred_locale, is_active').in('id', chunk).order('id').range(from, to));
    },
    subscriptions(userIds) {
      return fetchInChunks<OutboxSubscription>(userIds, (chunk, from, to) =>
        admin.from('push_subscriptions')
          .select('user_id, endpoint, keys_p256dh, keys_auth, muted_types')
          .in('user_id', chunk).order('id').range(from, to));
    },
    async markSent(id, note) {
      await admin.from('notification_outbox')
        .update({ sent_at: new Date().toISOString(), claimed_at: null, last_error: note })
        .eq('id', id);
    },
    async markRetry(id, nextAttemptAt, error) {
      await admin.from('notification_outbox')
        .update({ claimed_at: null, next_attempt_at: nextAttemptAt.toISOString(), last_error: error })
        .eq('id', id);
    },
    async deleteSubscriptions(endpoints) {
      for (let i = 0; i < endpoints.length; i += 100) {
        await admin.from('push_subscriptions').delete().in('endpoint', endpoints.slice(i, i + 100));
      }
    },
  };
}

serve(async req => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('Origin');

  try {
    const service = isServiceCaller(req);
    let userId: string | null = null;
    if (!service) {
      const { user } = await requireRole(req, [...ALL_ROLES]);
      userId = user.id;
      checkRateLimit(`send-push:${user.id}`, { maxRequests: 30, windowMs: 60_000 });
    }

    const input = PushInputSchema.parse(await req.json());
    const vapidKeys = vapidFromEnv();
    const configured = vapidKeys.publicKey !== '' && vapidKeys.privateKey !== '';
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Flush ───────────────────────────────
    if (input.action === 'flush') {
      // Sin claves no se coge nada: los avisos esperan a que se configure (2 días)
      if (!configured) {
        return jsonResponse({ success: false, configured: false, error: 'VAPID keys not configured' }, origin);
      }
      const result = await flushOutbox(outboxStore(admin), vapidKeys);
      if (result.claimed > 0) {
        console.info(`[send-push] flush: ${JSON.stringify(result)}`);
      }
      return jsonResponse({ success: true, configured: true, ...result }, origin);
    }

    // ── Test (solo a uno mismo) ─────────────
    if (!userId) {
      return jsonResponse({ error: 'Test pushes need a signed-in user' }, origin, 403);
    }
    if (!configured) {
      throw new Error('VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets.');
    }
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, keys_p256dh, keys_auth')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) {
      return jsonResponse({ success: false, error: 'No push subscriptions found' }, origin, 404);
    }
    const { sent, expired } = await deliverToSubscriptions(subs, {
      title: input.title || 'HarvestPro',
      body: input.body || 'Push notifications are working!',
      tag: 'test',
      url: '/',
      type: 'test',
    }, vapidKeys);
    if (expired.length > 0) {
      await admin.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', expired);
    }
    return jsonResponse({ success: true, sent, total: subs.length }, origin);
  } catch (error) {
    return errorResponse(error, origin, 'send-push');
  }
});
