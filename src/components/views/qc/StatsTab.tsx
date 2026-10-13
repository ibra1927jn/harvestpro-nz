/**
 * StatsTab — QC Analytics
 * Extracted from QualityControl.tsx monolith
 */
import EmptyState from '@/components/ui/EmptyState';
import { GradeDistribution } from '@/services/qc.service';
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
}

export default function StatsTab({ distribution }: StatsTabProps) {
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

            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('qc.summary')}</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-secondary">{t('qc.total_inspections')}</span>
                        <span className="font-medium text-text-primary">{distribution.total}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-secondary">{t('qc.export_quality')}</span>
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
