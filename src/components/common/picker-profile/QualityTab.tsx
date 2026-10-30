/**
 * QualityTab — Tab de calidad del picker: notas, puntuación y los criterios
 * con aviso (regular en ámbar, mal en rojo) de sus últimas inspecciones.
 * Extraído de PickerProfileDrawer.tsx
 *
 * Las respuestas de bienestar (informado / a gusto) NO salen aquí: este es el
 * perfil que ve cualquier rol del huerto.
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
    const flagged = quality.flaggedCriteria ?? [];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-emerald-700">{quality.gradeA}</p>
                    <p className="text-[10px] text-emerald-600 font-bold">{t('qc.grade_good')}</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-sky-700">{quality.gradeB}</p>
                    <p className="text-[10px] text-sky-600 font-bold">{t('qc.grade_acceptable')}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-amber-700">{quality.gradeC}</p>
                    <p className="text-[10px] text-amber-600 font-bold">{t('qc.grade_fix')}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-red-700">{quality.reject}</p>
                    <p className="text-[10px] text-red-600 font-bold">{t('qc.grade_severe')}</p>
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
            {flagged.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm" data-testid="flagged-criteria">
                    <p className="text-xs text-text-muted mb-2">{t('qc.profile_criteria')}</p>
                    <ul className="flex flex-wrap gap-1.5">
                        {flagged.map(c => (
                            <li
                                key={c.key}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${c.bad > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                            >
                                {t(`qc.crit.${c.key}`)}
                                <span className="ml-1 font-medium opacity-80">{t('qc.fail_counts', { bad: c.bad, warn: c.warn })}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
