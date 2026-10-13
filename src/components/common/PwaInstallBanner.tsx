/**
 * PwaInstallBanner — Non-intrusive bottom banner prompting app install
 * 
 * Only shows when:
 * - Not already installed (standalone)
 * - Not dismissed in last 7 days
 * - Native install prompt is available
 */
import React from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useTranslation } from '@/i18n';

const PwaInstallBanner: React.FC = () => {
    const { t } = useTranslation();
    const { canInstall, isInstalled, isDismissed, promptInstall, dismissBanner } = usePwaInstall();

    // Don't render if installed, dismissed, or no native prompt
    if (isInstalled || isDismissed || !canInstall) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 flex items-center gap-3 max-w-lg mx-auto">
                {/* Icon */}
                <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
                    <span aria-hidden="true" className="material-symbols-outlined text-white text-2xl">download</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{t('pwa.install_title')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('pwa.install_desc')}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={dismissBanner}
                        className="text-slate-400 hover:text-slate-600 p-1 transition-colors"
                        aria-label={t('pwa.dismiss')}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                    <button
                        onClick={promptInstall}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors active:scale-95"
                    >
                        {t('pwa.install')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PwaInstallBanner;
