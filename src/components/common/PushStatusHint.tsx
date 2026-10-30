/**
 * Debajo del interruptor «Notificaciones» (Mi cuenta y Ajustes del manager):
 * si en este dispositivo llegan los avisos con la app cerrada (push) o por qué no.
 * En iPhone/iPad solo con la app instalada en la pantalla de inicio: se dice siempre.
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { pushService } from '@/services/push.service';

type HintKey =
    | 'settings.push.active'
    | 'settings.push.ios_install'
    | 'settings.push.unsupported'
    | 'settings.push.not_configured'
    | 'settings.push.denied'
    | 'settings.push.open_only';

export function pushHintKey(enabled: boolean): HintKey | null {
    const reason = pushService.unavailableReason();
    if (reason === 'ios_needs_install') return 'settings.push.ios_install';
    if (!enabled) return null;
    if (reason === 'unsupported') return 'settings.push.unsupported';
    if (reason === 'not_configured') return 'settings.push.not_configured';
    if (reason === 'denied') return 'settings.push.denied';
    return pushService.isRegistered() ? 'settings.push.active' : 'settings.push.open_only';
}

export const PushStatusHint: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    const { t } = useTranslation();
    const key = pushHintKey(enabled);
    if (!key) return null;
    const ok = key === 'settings.push.active';
    return (
        <p
            data-testid="push-status"
            className={`mt-2 flex items-start gap-1.5 text-xs ${ok ? 'text-green-700' : 'text-amber-700'}`}
        >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">{ok ? 'notifications_active' : 'info'}</span>
            <span>{t(key)}</span>
        </p>
    );
};

export default PushStatusHint;
