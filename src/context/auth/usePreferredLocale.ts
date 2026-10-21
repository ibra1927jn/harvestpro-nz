/**
 * Idioma preferido de la cuenta (users.preferred_locale, «Mi cuenta»): al
 * cargar el perfil se aplica UNA vez por cuenta. Un cambio manual posterior
 * en la sesión no se pisa (ni al refrescar el perfil ni al guardar el idioma).
 * @module context/auth/usePreferredLocale
 */
import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { isLocale } from '@/i18n/locales';
import { logger } from '@/utils/logger';

export function usePreferredLocale(userId: string | undefined, preferredLocale: string | null | undefined): void {
    const { locale, setLocale } = useI18n();
    const appliedForUser = useRef<string | null>(null);
    // El idioma actual se lee por ref: el efecto solo debe reaccionar a la cuenta cargada
    const localeRef = useRef(locale);
    localeRef.current = locale;

    useEffect(() => {
        if (!userId || appliedForUser.current === userId) return;
        if (!isLocale(preferredLocale)) {
            // Sin preferencia guardada: no hay nada que aplicar (se vuelve a mirar si llega después)
            if (preferredLocale !== undefined) appliedForUser.current = userId;
            return;
        }
        appliedForUser.current = userId;
        if (preferredLocale === localeRef.current) return;
        void setLocale(preferredLocale).then(ok => {
            if (!ok) logger.warn(`[Auth] Could not apply preferred locale "${preferredLocale}"`);
        });
    }, [userId, preferredLocale, setLocale]);
}
