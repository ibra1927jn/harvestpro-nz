/**
 * Valor de estado/enum de la BD ('in_progress', 'urgent'…) → texto en el idioma de la app.
 * Usa la clave status.<valor>; si no existe, lo enseña legible ("in progress").
 */
import type { TFunction } from './index';
import { translations } from './locales';

export function statusLabel(t: TFunction, value: string | null | undefined): string {
    if (!value) return '';
    const key = `status.${value.toLowerCase()}`;
    return key in translations.en ? t(key) : value.replace(/_/g, ' ');
}
