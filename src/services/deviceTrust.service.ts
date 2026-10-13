/**
 * deviceTrust.service.ts — Limpieza de la antigua "confianza de dispositivo" MFA
 *
 * Versiones anteriores guardaban un token `mfa_device_trust_{userId}` para saltarse
 * el 2FA durante 72 h. Desde el cambio de MFA (el código se pide en cada login de
 * un rol privilegiado) nadie lo escribe ni lo lee: solo queda borrar el que se
 * dejó en el dispositivo al cerrar sesión.
 *  - Web (PWA): localStorage (además wipeLocalData lo vacía entero)
 *  - Android:   @capacitor/preferences (sobrevive a localStorage.clear)
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY_PREFIX = 'mfa_device_trust_';

/** Borra el token heredado del usuario. Llamar siempre en signOut. */
export async function clearDeviceTrust(userId: string): Promise<void> {
  const key = `${STORAGE_KEY_PREFIX}${userId}`;
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}
