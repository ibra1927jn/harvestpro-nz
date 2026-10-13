/**
 * QualityTab — Tab de calidad del picker: grades, score, inspections
 * Extraído de PickerProfileDrawer.tsx
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { PickerHistory } from '@/services/picker-history.service';
import QualityRing from './QualityRing';

interface QualityTabProps {
    quality: PickerHistory['quality'];
}

const QualityTab: React.FC<QualityTabProps> = ({ quality }) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-emerald-700">{quality.gradeA}</p>
                    <p className="text-[10px] text-emerald-600 font-bold">{t('panel.quality.grade_a')}</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-sky-700">{quality.gradeB}</p>
                    <p className="text-[10px] text-sky-600 font-bold">{t('panel.quality.grade_b')}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-amber-700">{quality.gradeC}</p>
                    <p className="text-[10px] text-amber-600 font-bold">{t('panel.quality.grade_c')}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-red-700">{quality.reject}</p>
                    <p className="text-[10px] text-red-600 font-bold">{t('panel.quality.rejected')}</p>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm text-center">
                <p className="text-xs text-text-muted mb-2">{t('panel.quality.overall')}</p>
                <div className="flex items-center justify-center gap-4">
                    <QualityRing score={quality.score} />
                    <div className="text-left">
                        <p className="text-2xl font-black text-text-main">{quality.score}/100</p>
                        <p className="text-xs text-text-muted">
                            {t('panel.quality.from').replace('{n}', String(quality.total))}
                        </p>
                    </div>
                </div>
            </div>
            {quality.total === 0 && (
                <div className="flex flex-col items-center py-6">
                    <span aria-hidden="true" className="material-symbols-outlined text-4xl text-slate-300 mb-2">search_off</span>
                    <p className="text-sm text-text-muted">{t('panel.quality.none')}</p>
                </div>
            )}
        </div>
    );
};

export default QualityTab;
