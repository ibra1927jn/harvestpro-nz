/**
 * «Mi cuenta» en carga perezosa, compartida por Header (móvil) y DesktopLayout.
 *
 * El chunk no va en el precache del service worker (vite.config.ts): todo lo
 * que escribe la pantalla necesita red, así que se descarga la primera vez que
 * se abre y queda en la caché de ejecución (CacheFirst). Si esa primera vez no
 * hay conexión, en vez de romper la página se enseña un aviso con cierre.
 */
import React, { lazy, useRef } from 'react';
import { useTranslation } from '@/i18n';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface AccountSheetProps {
    onClose: () => void;
}

/** Aviso cuando el chunk de Mi cuenta no se pudo descargar (sin red y sin caché) */
export const AccountSheetUnavailable: React.FC<AccountSheetProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    useDialogA11y(ref, { onClose });
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div ref={ref} role="dialog" aria-modal="true" aria-label={t('account.title')} tabIndex={-1}
                className="relative bg-surface-white rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4 outline-none">
                <p className="text-sm font-semibold text-text-main">{t('account.error.offline')}</p>
                <button type="button" onClick={onClose} className="w-full min-h-[44px] rounded-xl border-2 border-border-light text-sm font-bold">
                    {t('common.close')}
                </button>
            </div>
        </div>
    );
};

export const LazyAccountSheet = lazy<React.ComponentType<AccountSheetProps>>(() =>
    import('./AccountSheet').catch(() => ({ default: AccountSheetUnavailable })),
);
