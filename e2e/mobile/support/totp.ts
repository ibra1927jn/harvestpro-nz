/**
 * 2FA real para la suite móvil: da de alta un factor TOTP con secreto conocido
 * para los usuarios sembrados y calcula los códigos (RFC 6238, SHA-1, 6 dígitos).
 * Así el test pasa por la pantalla de código igual que un manager de verdad.
 */
import { createHmac } from 'crypto';

const URL_ = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error(`Invalid base32 char ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(bin).padStart(6, '0');
}

const currentStep = () => Math.floor(Date.now() / 30_000);

async function api(path: string, init: RequestInit & { token?: string; service?: boolean }) {
  const key = init.service ? SERVICE : ANON;
  const res = await fetch(`${URL_}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${init.token ?? key}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Solo un Supabase local (127.0.0.1 / localhost): ensureTotp borra factores 2FA reales. */
export function assertLocalSupabase(url: string): void {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to reset 2FA factors on a non-local Supabase (${host})`);
  }
}

const secrets = new Map<string, string>();
const lastStep = new Map<string, number>();

/** Factor TOTP verificado con secreto conocido (borra los anteriores). */
export async function ensureTotp(email: string, password: string): Promise<string> {
  const cached = secrets.get(email);
  if (cached) return cached;
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY needed in .env.local for MFA roles');
  // Borra los factores 2FA del usuario: nunca contra un Supabase que no sea local
  assertLocalSupabase(URL_);
  const session = await api('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const uid: string = session.user.id;
  const existing = (await api(`/admin/users/${uid}/factors`, { method: 'GET', service: true })) as {
    id: string;
  }[];
  for (const f of existing ?? []) {
    await api(`/admin/users/${uid}/factors/${f.id}`, { method: 'DELETE', service: true });
  }
  const factor = await api('/factors', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify({ factor_type: 'totp', friendly_name: `e2e-${Date.now()}` }),
  });
  const secret: string = factor.totp.secret;
  const challenge = await api(`/factors/${factor.id}/challenge`, {
    method: 'POST',
    token: session.access_token,
    body: '{}',
  });
  const step = currentStep();
  await api(`/factors/${factor.id}/verify`, {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify({ challenge_id: challenge.id, code: totpAt(secret, step) }),
  });
  lastStep.set(email, step);
  secrets.set(email, secret);
  return secret;
}

/** Código válido que no se haya usado ya para este usuario (espera a la siguiente ventana si hace falta). */
export async function nextCode(email: string): Promise<string> {
  const secret = secrets.get(email);
  if (!secret) throw new Error(`No TOTP secret for ${email}`);
  let step = currentStep();
  if (lastStep.get(email) === step) {
    await new Promise(r => setTimeout(r, 30_000 - (Date.now() % 30_000) + 250));
    step = currentStep();
  }
  lastStep.set(email, step);
  return totpAt(secret, step);
}
