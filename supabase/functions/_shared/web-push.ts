/**
 * web-push — Cifrado y envío Web Push (RFC 8291 + RFC 8188 aes128gcm) con VAPID.
 *
 * Solo Web Crypto y fetch: sin imports, funciona en Deno (Edge Functions) y en
 * Node (tests). Extraído de send-push/index.ts.
 */

/**
 * Bytes respaldados por un ArrayBuffer normal (lo que piden WebCrypto y
 * fetch). Con TypeScript ≥ 5.7 un Uint8Array a secas puede ir sobre un
 * SharedArrayBuffer y `deno check` falla; inferido así vale en ambas versiones.
 */
const _newBytes = (n: number) => new Uint8Array(n);
export type Bytes = ReturnType<typeof _newBytes>;

/** Decodifica base64url a Uint8Array */
export function base64urlDecode(str: string): Bytes {
  // Restaura padding y caracteres estándar
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** Concatena múltiples Uint8Arrays */
function concatBytes(...arrays: Bytes[]): Bytes {
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
export async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number
): Promise<Bytes> {
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
export async function encryptPayload(
  plaintext: Bytes,
  subscriptionPublicKey: Bytes,
  subscriptionAuth: Bytes
): Promise<{ encrypted: Bytes; localPublicKey: Bytes }> {
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
export async function sendWebPush(
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
export async function createVapidJwt(
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

export interface PushSubscriptionRow {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

/**
 * Envía el mismo payload a varias suscripciones. Devuelve cuántas se
 * entregaron y los endpoints caducados (404/410) para borrarlos.
 */
export async function deliverToSubscriptions(
  subs: PushSubscriptionRow[],
  payload: Record<string, unknown>,
  vapidKeys: { publicKey: string; privateKey: string; subject: string },
  send: typeof sendWebPush = sendWebPush
): Promise<{ sent: number; expired: string[] }> {
  let sent = 0;
  const expired: string[] = [];
  for (const sub of subs) {
    const result = await send(sub, payload, vapidKeys);
    if (result.success) sent++;
    if (result.statusCode === 404 || result.statusCode === 410) expired.push(sub.endpoint);
  }
  return { sent, expired };
}
