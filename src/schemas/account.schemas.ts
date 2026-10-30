/**
 * account.schemas.ts — Validación en el cliente de «Mi cuenta».
 * Mismos límites que update_my_profile() en la BD (migración 20261022050000):
 * el formulario avisa antes de pedir nada al servidor.
 */
import { z } from 'zod';
import { LOCALE_CODES } from '@/i18n/locales';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;
export const PHONE_MAX = 30;
export const PASSWORD_MIN = 8;

export const ProfileDetailsSchema = z.object({
    full_name: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
    // Formato libre (prefijos, espacios, guiones): solo se limita la longitud
    phone: z.string().trim().max(PHONE_MAX),
});
export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>;

export const PreferredLocaleSchema = z.enum(LOCALE_CODES);

export const PasswordChangeSchema = z
    .object({
        current: z.string().min(1),
        next: z.string().min(PASSWORD_MIN),
        repeat: z.string(),
    })
    .refine(v => v.next === v.repeat, { path: ['repeat'], message: 'mismatch' })
    .refine(v => v.next !== v.current, { path: ['next'], message: 'same_as_current' });
export type PasswordChange = z.infer<typeof PasswordChangeSchema>;

/** Tipos de imagen que se pueden elegir (los HEIC se convierten en el navegador si lo soporta); se suben siempre como JPEG */
export const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** Tamaño máximo del fichero elegido (antes de reducirlo); el bucket admite 2 MB ya reducido */
export const AVATAR_INPUT_MAX_BYTES = 20 * 1024 * 1024;
