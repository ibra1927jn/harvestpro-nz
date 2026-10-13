/**
 * PickerDrawerHistory — Tab de historial (wrapper delgado sobre HistoryTab).
 * Maneja loading y empty state antes de delegar al componente existente.
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import type { PickerHistory } from '@/services/picker-history.service';
import HistoryTab from '../common/picker-profile/HistoryTab';

interface PickerDrawerHistoryProps {
    history: PickerHistory | null;
    isLoading: boolean;
}

const PickerDrawerHistory: React.FC<PickerDrawerHistoryProps> = ({ history, isLoading }) => {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="w-10 h-10 rounded-full border-2 border-primary-light border-t-primary animate-spin mx-auto mb-3" />
                    <p className="text-sm text-text-muted">{t('panel.loading')}</p>
                </div>
            </div>
        );
    }

    if (history === null) {
        return (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
                <span aria-hidden="true" className="material-symbols-outlined text-5xl text-slate-300">history</span>
                <p className="text-sm text-text-muted">{t('panel.no_history')}</p>
            </div>
        );
    }

    const dailyBuckets = history.dailyRecords.map(r => r.buckets);

    return <HistoryTab history={history} dailyBuckets={dailyBuckets} />;
};

export default PickerDrawerHistory;
