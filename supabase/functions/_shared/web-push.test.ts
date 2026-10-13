// @vitest-environment node
/**
 * web-push — se comprueba que un navegador suscrito puede descifrar lo que
 * enviamos (RFC 8291) y que el JWT VAPID se verifica con la clave pública.
 */
import { describe, it, expect } from 'vitest';
import {
  base64urlDecode,
  createVapidJwt,
  deliverToSubscriptions,
  encryptPayload,
  hkdf,
} from './web-push.ts';

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap(p => Array.from(p)));

describe('base64urlDecode', () => {
  it('decodes url-safe base64 without padding', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1, 2]);
    expect(Array.from(base64urlDecode(b64url(bytes)))).toEqual(Array.from(bytes));
  });
});

describe('hkdf', () => {
  it('matches RFC 5869 test case 1', async () => {
    const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map(h => parseInt(h, 16)));
    const okm = await hkdf(hex('000102030405060708090a0b0c'), hex('0b'.repeat(22)), hex('f0f1f2f3f4f5f6f7f8f9'), 42);
    expect(Buffer.from(okm).toString('hex')).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );
  });
});

describe('encryptPayload', () => {
  it('produces an aes128gcm body the subscriber can decrypt', async () => {
    // Suscriptor (el navegador): par ECDH + secreto de autenticación
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const message = enc.encode(JSON.stringify({ title: 'Kia ora', body: 'Row 12 is ready' }));

    const { encrypted, localPublicKey } = await encryptPayload(message, uaPublic, auth);

    // Cabecera: salt(16) | rs(4) | idlen(1) | keyid(65)
    const salt = encrypted.slice(0, 16);
    const rs = new DataView(encrypted.buffer, encrypted.byteOffset + 16, 4).getUint32(0, false);
    const idlen = encrypted[20];
    const keyid = encrypted.slice(21, 21 + idlen);
    expect(rs).toBe(4096);
    expect(idlen).toBe(65);
    expect(Array.from(keyid)).toEqual(Array.from(localPublicKey));

    // Descifrado del lado del navegador (RFC 8291 §3.4)
    const asKey = await crypto.subtle.importKey('raw', keyid, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
    const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, keyid), 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, encrypted.slice(21 + idlen)));

    // Último registro: delimitador 0x02 al final
    expect(plain[plain.length - 1]).toBe(2);
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(JSON.stringify({ title: 'Kia ora', body: 'Row 12 is ready' }));
  });
});

describe('createVapidJwt', () => {
  it('signs an ES256 JWT for the push service origin that verifies with the public key', async () => {
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    const before = Math.floor(Date.now() / 1000);

    const jwt = await createVapidJwt('https://fcm.googleapis.com', 'mailto:admin@harvestpro.nz', b64url(pkcs8));

    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:admin@harvestpro.nz');
    expect(claims.exp - before).toBeGreaterThanOrEqual(86400);
    expect(claims.exp - before).toBeLessThanOrEqual(86401);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      kp.publicKey,
      base64urlDecode(sig),
      enc.encode(`${h}.${p}`)
    );
    expect(ok).toBe(true);
  });
});

describe('deliverToSubscriptions', () => {
  it('counts deliveries and collects expired endpoints (404/410)', async () => {
    const results: Record<string, { success: boolean; statusCode?: number }> = {
      a: { success: true, statusCode: 201 },
      b: { success: false, statusCode: 410 },
      c: { success: false, statusCode: 404 },
      d: { success: false, statusCode: 500 },
    };
    const subs = Object.keys(results).map(endpoint => ({ endpoint, keys_p256dh: '', keys_auth: '' }));
    const out = await deliverToSubscriptions(subs, {}, { publicKey: '', privateKey: '', subject: '' }, async sub => results[sub.endpoint]);
    expect(out).toEqual({ sent: 1, expired: ['b', 'c'] });
  });
});
