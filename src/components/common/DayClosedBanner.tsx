/**
 * DayClosedBanner — «El día está cerrado» para el TL y el runner (B2).
 *
 * Cuando el manager cierra el día, la BD rechaza cubetas y fichajes de hoy.
 * Antes el TL y el runner solo veían «escaneo rechazado»; ahora el store lee
 * day_closures al cargar y en vivo (realtime) y aquí se avisa.
 */
import React from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useTranslation } from '@/i18n';

const DayClosedBanner: React.FC = () => {
    const dayClosed = useHarvestStore(s => s.dayClosed);
    const { t } = useTranslation();
    if (!dayClosed) return null;
    return (
        <div role="status" data-testid="day-closed-banner" className="mx-4 mt-3 mb-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 relative z-10">
            <span aria-hidden="true" className="material-symbols-outlined text-amber-600">lock_clock</span>
            <div>
                <p className="text-sm font-bold text-amber-900">{t('close.banner_title')}</p>
                <p className="text-xs text-amber-800">{t('close.banner_body')}</p>
            </div>
        </div>
    );
};

export default DayClosedBanner;
