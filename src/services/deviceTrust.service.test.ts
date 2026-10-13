/**
 * deviceTrust.service.test.ts — borrado del token heredado de confianza MFA
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prefs = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key); }),
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn().mockReturnValue(false) },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: { remove: prefs.remove },
}));

import { Capacitor } from '@capacitor/core';
import { clearDeviceTrust } from './deviceTrust.service';

const mockIsNative = vi.mocked(Capacitor.isNativePlatform);

describe('clearDeviceTrust', () => {
  beforeEach(() => {
    localStorage.clear();
    prefs.store.clear();
    prefs.remove.mockClear();
    mockIsNative.mockReturnValue(false);
  });

  it('web: removes only the leftover token of that user from localStorage', async () => {
    localStorage.setItem('mfa_device_trust_user-A', '{"userId":"user-A","expiresAt":1}');
    localStorage.setItem('mfa_device_trust_user-B', '{"userId":"user-B","expiresAt":1}');
    localStorage.setItem('other', 'kept');

    await clearDeviceTrust('user-A');

    expect(localStorage.getItem('mfa_device_trust_user-A')).toBeNull();
    expect(localStorage.getItem('mfa_device_trust_user-B')).not.toBeNull();
    expect(localStorage.getItem('other')).toBe('kept');
    expect(prefs.remove).not.toHaveBeenCalled();
  });

  it('web: nothing to remove is not an error', async () => {
    await expect(clearDeviceTrust('user-none')).resolves.toBeUndefined();
  });

  it('Android: removes the token from Capacitor Preferences (survives localStorage.clear)', async () => {
    mockIsNative.mockReturnValue(true);
    prefs.store.set('mfa_device_trust_user-A', '{}');
    localStorage.setItem('mfa_device_trust_user-A', 'web copy');

    await clearDeviceTrust('user-A');

    expect(prefs.store.has('mfa_device_trust_user-A')).toBe(false);
    // En nativo no se toca localStorage
    expect(localStorage.getItem('mfa_device_trust_user-A')).toBe('web copy');
  });
});
