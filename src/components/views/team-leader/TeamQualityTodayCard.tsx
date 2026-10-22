/**
 * «Calidad de mi equipo hoy» (Inicio del team leader): inspecciones de QC de
 * hoy de su equipo con la nota, el peor criterio y la hora. En vivo (llegan por
 * el canal del huerto). Tocar una abre el cajón del picker.
 * Las respuestas de bienestar solo se marcan si el rol puede verlas.
 */
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useQcAlerts } from '@/hooks/useQcAlerts';
import { asGrade, canViewWellbeing, hasWellbeingFlag, isQcAlert, worstCriterionOf } from '@/services/qcAlerts';
import { gradeLabel, gradeLetter } from '@/components/views/qc/gradeLabel';
import { formatNZTime } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

const PILL: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-700',
    B: 'bg-sky-100 text-sky-700',
    C: 'bg-amber-100 text-amber-700',
    reject: 'bg-red-100 text-red-700',
};

const MAX_ROWS = 8;

export const TeamQualityTodayCard: React.FC = () => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const { todayInspections } = useQcAlerts();
    const crew = useHarvestStore(s => s.crew);
    const openPickerProfile = useHarvestStore(s => s.openPickerProfile);
    const showWellbeing = canViewWellbeing(appUser?.role);
    const names = new Map((Array.isArray(crew) ? crew : []).map(p => [p.id, p.name]));
    const rows = todayInspections.slice(0, MAX_ROWS);
    const flagged = todayInspections.filter(isQcAlert).length;

    return (
        <section data-testid="tl-quality-today" className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 tracking-tight">
                    <span aria-hidden="true" className="material-symbols-outlined text-primary">grading</span>
                    {t('comms.tl_quality_title')}
                </h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${flagged > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                    {t('comms.tl_quality_count', { n: todayInspections.length, bad: flagged })}
                </span>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-slate-400">{t('comms.tl_quality_empty')}</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.map(insp => {
                        const grade = asGrade(insp.grade);
                        const worst = worstCriterionOf(insp);
                        const name = names.get(insp.picker_id) || '—';
                        return (
                            <li key={insp.id}>
                                <button
                                    type="button"
                                    onClick={() => openPickerProfile(insp.picker_id)}
                                    aria-label={t('tl.picker.open_profile', { name })}
                                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-50 rounded-lg"
                                >
                                    <span className={`min-w-[2.25rem] text-center text-xs font-black px-2 py-1 rounded-lg ${PILL[grade]}`} title={gradeLabel(t, grade)}>
                                        {gradeLetter(t, grade)}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-bold text-slate-800 truncate">{name}</span>
                                        <span className={`block text-[11px] font-semibold ${worst?.state === 'bad' ? 'text-red-600' : 'text-slate-400'}`}>
                                            {worst
                                                ? t(worst.state === 'bad' ? 'comms.worst_bad' : 'comms.worst_warn', { criterion: t(`qc.crit.${worst.key}`) })
                                                : t('comms.worst_none')}
                                        </span>
                                    </span>
                                    {showWellbeing && hasWellbeingFlag(insp) && (
                                        <span title={t('qc.wellbeing_title')} className="text-amber-500">
                                            <span aria-hidden="true" className="material-symbols-outlined text-base">favorite</span>
                                            <span className="sr-only">{t('qc.wellbeing_title')}</span>
                                        </span>
                                    )}
                                    <span className="text-[11px] font-bold text-slate-400 tabular-nums">{formatNZTime(insp.created_at)}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default TeamQualityTodayCard;
