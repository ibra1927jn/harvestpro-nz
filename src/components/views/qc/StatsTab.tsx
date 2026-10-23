/**
 * StatsTab — QC Analytics
 * Extracted from QualityControl.tsx monolith
 *
 * Reparto de notas del día, resumen y el criterio que más falla (recuento de
 * regular / mal por criterio sobre las inspecciones de hoy). Las respuestas
 * de bienestar NO entran aquí (van en Historial, solo para TL / manager / RRHH).
 */
import React from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { GradeDistribution, QCInspection } from '@/services/qc.service';
import { countCriteriaFailures } from '@/services/qcCriteria';
import DistributionBar from './DistributionBar';
import { useTranslation } from '@/i18n';
import { gradeLabel } from './gradeLabel';

const GRADE_COLORS: Record<string, string> = {
    A: 'text-green-700',
    B: 'text-blue-700',
    C: 'text-amber-700',
    reject: 'text-red-700',
};

interface StatsTabProps {
    distribution: GradeDistribution;
    /** Inspecciones de hoy (para el criterio que más falla); opcional por compatibilidad */
    inspections?: QCInspection[];
}

export default function StatsTab({ distribution, inspections = [] }: StatsTabProps) {
    const { t } = useTranslation();
    if (distribution.total === 0) {
        return (
            <EmptyState
                icon="bar_chart"
                title={t('qc.stats_empty_title')}
                subtitle={t('qc.stats_empty_desc')}
                compact
            />
        );
    }

    const pct = (grade: keyof Omit<GradeDistribution, 'total'>) =>
        Math.round((distribution[grade] / distribution.total) * 100);

    const failures = countCriteriaFailures(inspections);
    const top = failures[0] && failures[0].total > 0 ? failures[0] : null;
    const maxTotal = Math.max(1, ...failures.map(f => f.total));

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">{t('qc.grade_distribution')}</h3>
                <DistributionBar distribution={distribution} large />
                <div className="grid grid-cols-4 gap-3 mt-4">
                    {(['A', 'B', 'C', 'reject'] as const).map(grade => (
                        <div key={grade} className="text-center">
                            <div className={`text-2xl font-bold ${GRADE_COLORS[grade]}`}>
                                {distribution[grade]}
                            </div>
                            <div className="text-xs text-text-secondary">
                                {gradeLabel(t, grade)}
                            </div>
                            <div className="text-xs text-text-muted">
                                {pct(grade)}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Criterio que más falla hoy */}
            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5" data-testid="top-failing">
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('qc.top_failing')}</h3>
                {top ? (
                    <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 mb-4">
                        <span aria-hidden="true" className="material-symbols-outlined text-red-500">priority_high</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-red-800">{t(`qc.crit.${top.key}`)}</p>
                            <p className="text-xs text-red-600">{t('qc.fail_counts', { bad: top.bad, warn: top.warn })}</p>
                        </div>
                        <span className="text-2xl font-black text-red-700">{top.total}</span>
                    </div>
                ) : (
                    <p className="text-sm text-text-muted mb-4">{t('qc.failing_none')}</p>
                )}
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">{t('qc.criteria_breakdown')}</h4>
                <ul className="space-y-2">
                    {failures.map(f => (
                        <li key={f.key} className="flex items-center gap-3 text-sm">
                            <span className="w-36 shrink-0 text-text-primary truncate">{t(`qc.crit.${f.key}`)}</span>
                            <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden flex" aria-hidden="true">
                                <span className="h-full bg-red-500 dynamic-width" style={{ '--w': `${(f.bad / maxTotal) * 100}%` } as React.CSSProperties} />
                                <span className="h-full bg-amber-400 dynamic-width" style={{ '--w': `${(f.warn / maxTotal) * 100}%` } as React.CSSProperties} />
                            </span>
                            <span className="w-28 shrink-0 text-right text-xs text-text-muted">
                                {f.total > 0 ? t('qc.fail_counts', { bad: f.bad, warn: f.warn }) : '—'}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('qc.summary')}</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-secondary">{t('qc.total_inspections')}</span>
                        <span className="font-medium text-text-primary">{distribution.total}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-secondary">{t('qc.good_rate')}</span>
                        <span className="font-medium text-green-600">{pct('A')}%</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-secondary">{t('qc.rejection_rate')}</span>
                        <span className="font-medium text-red-600">{pct('reject')}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
