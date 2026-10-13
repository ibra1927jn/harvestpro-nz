/**
 * Clave del cifrado de la cola offline: lo cifrado tiene que seguir
 * descifrándose tras recargar la app, aunque cambien cosas del dispositivo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { db } from '../db';
import { encryptValue, decryptValue, encryptRecord, decryptRecord, resetKeyCache } from '../dbCrypto';

const originalUA = navigator.userAgent;
const setUA = (ua: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
const setScreen = (w: number, h: number) => {
    Object.defineProperty(screen, 'width', { configurable: true, get: () => w });
    Object.defineProperty(screen, 'height', { configurable: true, get: () => h });
};

beforeEach(async () => {
    await db.sync_meta.clear();
    resetKeyCache();
    setUA('Mozilla/5.0 (Linux; Android 14) Chrome/129.0.0.0 Mobile');
    setScreen(412, 915);
});
afterEach(() => {
    setUA(originalUA);
    resetKeyCache();
});

describe('dbCrypto key stability', () => {
    it('many encryptions at once on a fresh device all decrypt after a reload', async () => {
        // Modo lote: varios escaneos se cifran a la vez antes de existir la sal.
        // Antes cada uno creaba su propia sal y casi todos quedaban ilegibles.
        const values = Array.from({ length: 8 }, (_, i) => `runner-${i}`);
        const cipher = await Promise.all(values.map(v => encryptValue(v)));
        resetKeyCache(); // recarga
        const plain = await Promise.all(cipher.map(c => decryptValue(c)));
        expect(plain).toEqual(values);
    });

    it('still decrypts after the phone is rotated or Chrome updates', async () => {
        const cipher = await encryptValue('Mensaje pendiente para el jefe de equipo');
        // App muerta en segundo plano; se reabre en horizontal y con Chrome actualizado
        setScreen(915, 412);
        setUA('Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile');
        resetKeyCache();
        expect(await decryptValue(cipher)).toBe('Mensaje pendiente para el jefe de equipo');
    });

    it('reads data encrypted by the previous version (device-fingerprint key)', async () => {
        // Clave como la derivaba la versión anterior: huella del dispositivo + sal
        const plainBefore = await encryptValue('warm-up'); // crea la sal
        expect(await decryptValue(plainBefore)).toBe('warm-up');
        const salt = new Uint8Array(String((await db.sync_meta.get('crypto_salt_v3'))!.value).split(',').map(Number));
        const fingerprint = [navigator.userAgent, navigator.language, String(screen.width), String(screen.height),
            Intl.DateTimeFormat().resolvedOptions().timeZone, 'HarvestPro-NZ-2026-v2'].join('|');
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(fingerprint), 'PBKDF2', false, ['deriveKey']);
        const legacy = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
            material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, legacy, new TextEncoder().encode('old-scan')));
        const combined = new Uint8Array(iv.length + ct.length);
        combined.set(iv);
        combined.set(ct, iv.length);
        const old = 'v2:' + btoa(String.fromCharCode(...combined));

        resetKeyCache();
        expect(await decryptValue(old)).toBe('old-scan');
    });
});

describe('dbCrypto record round trip', () => {
    it('a text field comes back exactly as written, even when it looks like JSON', async () => {
        for (const content of ['4 ', '12', 'null', 'true', '"ok"', '[1,2]', '{"a":1}', 'hola']) {
            const stored = await encryptRecord('message_queue', { id: 'm1', content });
            expect(String(stored.content).startsWith('v2:')).toBe(true);
            const back = await decryptRecord('message_queue', stored);
            expect(back.content).toBe(content);
        }
    });
});
