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

/**
 * send-push — Server-side Push Notification Delivery
 *
 * Uses the Web Push protocol to send notifications to subscribed browsers/devices
 * (cifrado y envío en _shared/web-push.ts).
 * Supports: individual targeting, role-based broadcast, and test pushes.
 *
 * Environment secrets needed:
 *   VAPID_PRIVATE_KEY — base64url-encoded ECDSA P-256 private key
 *   VAPID_PUBLIC_KEY  — base64url-encoded ECDSA P-256 public key
 *   VAPID_SUBJECT     — mailto: URI or https: URL identifying the sender
 */

// ── Input Schemas ──────────────────────────────────

const SendToUserSchema = z.object({
  action: z.literal('send_to_user'),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().optional(),
  tag: z.string().optional(),
  type: z.string().optional(),
});

const BroadcastSchema = z.object({
  action: z.literal('broadcast'),
  role: z.enum(['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics']).optional(),
  orchard_id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().optional(),
  tag: z.string().optional(),
  type: z.string().optional(),
});

const TestPushSchema = z.object({
  action: z.literal('test'),
  title: z.string().optional(),
  body: z.string().optional(),
});

const PushInputSchema = z.discriminatedUnion('action', [
  SendToUserSchema,
  BroadcastSchema,
  TestPushSchema,
]);

// ── Main Handler ───────────────────────────────────

serve(async req => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('Origin');

  try {
    // Auth: cualquiera puede probar sus propias notificaciones; enviar a otros
    // solo admin, manager y team leader (antes la prueba daba 403 al resto)
    const { user, supabase } = await requireRole(req, [
      'admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics',
    ]);
    const { data: senderRow } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    const senderRole = (senderRow?.role as string | undefined) ?? '';

    checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 });

    const body = await req.json();
    const input = PushInputSchema.parse(body);
    if (input.action !== 'test' && !['admin', 'manager', 'team_leader'].includes(senderRole)) {
      return jsonResponse({ error: 'Only admin, manager or team leader can send notifications to others' }, origin, 403);
    }

    // Load VAPID keys from Deno env (set via Supabase secrets)
    const vapidKeys = {
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
      subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@harvestpro.nz',
    };

    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      throw new Error(
        'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets.'
      );
    }

    // ── Test Push ───────────────────────────
    if (input.action === 'test') {
      // Fetch subscriptions for the requesting user
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys_p256dh, keys_auth')
        .eq('user_id', user.id);

      if (!subs || subs.length === 0) {
        return jsonResponse({ success: false, error: 'No push subscriptions found' }, origin, 404);
      }

      const payload = {
        title: input.title || '🍒 HarvestPro Push Test',
        body: input.body || 'Push notifications are working!',
        tag: 'test',
        url: '/',
      };

      const { sent, expired } = await deliverToSubscriptions(subs, payload, vapidKeys);
      // Limpiar suscripciones caducadas
      for (const endpoint of expired) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }

      return jsonResponse({ success: true, sent, total: subs.length }, origin);
    }

    // ── Send to User ────────────────────────
    if (input.action === 'send_to_user') {
      // Las suscripciones de OTRA persona solo se leen con la clave de servicio
      // (RLS solo enseña las propias: antes nunca se enviaba nada). Por eso se
      // limita, como broadcast, a gente activa del huerto de quien envía.
      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: pair } = await adminSupabase
        .from('users')
        .select('id, orchard_id, is_active')
        .in('id', [user.id, input.user_id]);
      const sender = (pair ?? []).find((u: { id: string }) => u.id === user.id);
      const recipient = (pair ?? []).find((u: { id: string }) => u.id === input.user_id);
      if (!recipient || !recipient.is_active || !sender?.orchard_id || recipient.orchard_id !== sender.orchard_id) {
        return jsonResponse({ error: 'You can only notify active people in your orchard' }, origin, 403);
      }

      const { data: subs } = await adminSupabase
        .from('push_subscriptions')
        .select('endpoint, keys_p256dh, keys_auth')
        .eq('user_id', input.user_id);

      if (!subs || subs.length === 0) {
        return jsonResponse({ success: false, sent: 0 }, origin);
      }

      const payload = {
        title: input.title,
        body: input.body,
        url: input.url || '/',
        tag: input.tag || `notification-${Date.now()}`,
        type: input.type || 'general',
      };

      const { sent, expired } = await deliverToSubscriptions(subs, payload, vapidKeys);
      // Limpiar suscripciones caducadas (del destinatario: clave de servicio)
      if (expired.length > 0) {
        await adminSupabase.from('push_subscriptions').delete().eq('user_id', input.user_id).in('endpoint', expired);
      }

      return jsonResponse({ success: true, sent, total: subs.length }, origin);
    }

    // ── Broadcast ───────────────────────────
    if (input.action === 'broadcast') {
      // Use service_role client for cross-user access
      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Solo a la gente del huerto de quien envía (antes iba a todos los
      // suscritos de todas las empresas), y al rol pedido si lo hay
      const { data: me } = await adminSupabase.from('users').select('orchard_id').eq('id', user.id).single();
      // (solo cuentas activas: una persona dada de baja no recibe avisos)
      let people = adminSupabase.from('users').select('id').eq('is_active', true).eq('orchard_id', me?.orchard_id ?? '00000000-0000-0000-0000-000000000000');
      if (input.role) people = people.eq('role', input.role);
      const { data: recipients } = await people;
      const ids = (recipients ?? []).map((u: { id: string }) => u.id);
      const { data: subs } = ids.length
        ? await adminSupabase.from('push_subscriptions').select('endpoint, keys_p256dh, keys_auth, user_id').in('user_id', ids)
        : { data: [] as Array<{ endpoint: string; keys_p256dh: string; keys_auth: string; user_id: string }> };

      if (!subs || subs.length === 0) {
        return jsonResponse({ success: true, sent: 0, total: 0 }, origin);
      }

      const payload = {
        title: input.title,
        body: input.body,
        url: input.url || '/',
        tag: input.tag || `broadcast-${Date.now()}`,
        type: input.type || 'broadcast',
      };

      const { sent, expired } = await deliverToSubscriptions(subs, payload, vapidKeys);

      // Clean up expired subscriptions
      if (expired.length > 0) {
        await adminSupabase.from('push_subscriptions').delete().in('endpoint', expired);
      }

      console.info(
        `[send-push] Broadcast: ${sent}/${subs.length} delivered, ${expired.length} expired`
      );
      return jsonResponse(
        { success: true, sent, total: subs.length, expired: expired.length },
        origin
      );
    }

    return jsonResponse({ error: 'Unknown action' }, origin, 400);
  } catch (error) {
    return errorResponse(error, origin, 'send-push');
  }
});
