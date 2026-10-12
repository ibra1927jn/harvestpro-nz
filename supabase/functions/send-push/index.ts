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

/**
 * send-push — Server-side Push Notification Delivery
 *
 * Uses the Web Push protocol to send notifications to subscribed browsers/devices.
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

// ── Web Push Crypto (RFC 8291 + RFC 8188 aes128gcm) ──

/** Decodifica base64url a Uint8Array */
function base64urlDecode(str: string): Uint8Array {
  // Restaura padding y caracteres estándar
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** Concatena múltiples Uint8Arrays */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * HKDF-SHA256 — deriva key material según RFC 5869.
 * Usa Web Crypto API disponible en Deno.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Extract: PRK = HMAC-SHA-256(salt, IKM)
  const prkKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm));

  // Expand: output = T(1) || T(2) || ... truncado a length
  const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = Math.ceil(length / 32);
  const output = new Uint8Array(blocks * 32);
  let prev = new Uint8Array(0);
  for (let i = 1; i <= blocks; i++) {
    const input = concatBytes(prev, info, new Uint8Array([i]));
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, input));
    output.set(prev, (i - 1) * 32);
  }
  return output.slice(0, length);
}

/**
 * Encripta el payload según RFC 8188 (aes128gcm) + RFC 8291 (Web Push).
 * Pasos:
 * 1. Genera keypair ECDH efímero (P-256)
 * 2. Deriva shared secret con p256dh del subscriber
 * 3. Usa HKDF para derivar IKM, luego content encryption key y nonce
 * 4. Encripta con AES-128-GCM
 * 5. Construye header aes128gcm
 */
async function encryptPayload(
  plaintext: Uint8Array,
  subscriptionPublicKey: Uint8Array,
  subscriptionAuth: Uint8Array
): Promise<{ encrypted: Uint8Array; localPublicKey: Uint8Array }> {
  // 1. Generar keypair ECDH efímero
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;

  // Exportar clave pública local como uncompressed point (65 bytes)
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  );

  // 2. Importar p256dh del subscriber como clave pública ECDH
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriptionPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 3. Derivar shared secret via ECDH
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberKey },
      localKeyPair.privateKey,
      256
    )
  );

  const encoder = new TextEncoder();

  // 4. Derivar IKM según RFC 8291 Sección 3.4:
  // IKM = HKDF(auth_secret, shared_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const ikmInfo = concatBytes(
    encoder.encode('WebPush: info\0'),
    subscriptionPublicKey,
    localPublicKeyRaw
  );
  const ikm = await hkdf(subscriptionAuth, sharedSecret, ikmInfo, 32);

  // 5. Generar salt aleatorio de 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. Derivar content encryption key (CEK) y nonce desde IKM
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 7. Pad el plaintext: agregar delimiter \x02 (último registro)
  const padded = concatBytes(plaintext, new Uint8Array([2]));

  // 8. Encriptar con AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      padded
    )
  );

  // 9. Construir header aes128gcm (RFC 8188 Sección 2.1):
  // salt (16) || rs (4, big-endian uint32) || idlen (1) || keyid (65 = uncompressed point)
  const recordSize = 4096; // tamaño de registro por defecto
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, recordSize, false);
  const idlen = new Uint8Array([localPublicKeyRaw.length]); // 65

  const header = concatBytes(salt, rs, idlen, localPublicKeyRaw);
  const encrypted = concatBytes(header, ciphertext);

  return { encrypted, localPublicKey: localPublicKeyRaw };
}

/**
 * Envía una notificación push usando el protocolo Web Push (RFC 8291).
 * Encripta el payload con aes128gcm usando las keys del subscriber.
 */
async function sendWebPush(
  subscription: { endpoint: string; keys_p256dh: string; keys_auth: string },
  payload: Record<string, unknown>,
  vapidKeys: { publicKey: string; privateKey: string; subject: string }
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    // Construir VAPID JWT
    const vapidJwt = await createVapidJwt(
      new URL(subscription.endpoint).origin,
      vapidKeys.subject,
      vapidKeys.privateKey
    );

    // Decodificar keys del subscriber
    const p256dh = base64urlDecode(subscription.keys_p256dh);
    const auth = base64urlDecode(subscription.keys_auth);

    // Encriptar payload con aes128gcm (RFC 8291)
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const { encrypted } = await encryptPayload(plaintext, p256dh, auth);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        Authorization: `vapid t=${vapidJwt}, k=${vapidKeys.publicKey}`,
        TTL: '86400', // 24 horas
        Urgency: 'normal',
        'Content-Length': String(encrypted.byteLength),
      },
      body: encrypted,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, statusCode: response.status };
    }

    // 404 o 410 = suscripción expirada/inválida, limpiar
    if (response.status === 404 || response.status === 410) {
      return { success: false, statusCode: response.status, error: 'Subscription expired' };
    }

    return {
      success: false,
      statusCode: response.status,
      error: `Push service returned ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Create a VAPID JWT for Web Push authentication.
 * This is a simplified implementation using the Web Crypto API.
 */
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400, // 24 hours
    sub: subject,
  };

  const headerB64 = btoa(JSON.stringify(header))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the ECDSA private key
  const keyData = Uint8Array.from(atob(privateKeyBase64.replace(/-/g, '+').replace(/_/g, '/')), c =>
    c.charCodeAt(0)
  );
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${sigB64}`;
}

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

      let sent = 0;
      for (const sub of subs) {
        const result = await sendWebPush(sub, payload, vapidKeys);
        if (result.success) sent++;
        // Clean up expired subscriptions
        if (result.statusCode === 404 || result.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }

      return jsonResponse({ success: true, sent, total: subs.length }, origin);
    }

    // ── Send to User ────────────────────────
    if (input.action === 'send_to_user') {
      const { data: subs } = await supabase
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

      let sent = 0;
      for (const sub of subs) {
        const result = await sendWebPush(sub, payload, vapidKeys);
        if (result.success) sent++;
        if (result.statusCode === 404 || result.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
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
      let people = adminSupabase.from('users').select('id').eq('orchard_id', me?.orchard_id ?? '00000000-0000-0000-0000-000000000000');
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

      let sent = 0;
      const expired: string[] = [];
      for (const sub of subs) {
        const result = await sendWebPush(sub, payload, vapidKeys);
        if (result.success) sent++;
        if (result.statusCode === 404 || result.statusCode === 410) {
          expired.push(sub.endpoint);
        }
      }

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
