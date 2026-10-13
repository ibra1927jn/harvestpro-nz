/**
 * DistributionBar — QC Grade Distribution visualization
 * Extracted from QualityControl.tsx monolith
 */
import React from 'react';
import { GradeDistribution } from '@/services/qc.service';
import { useTranslation } from '@/i18n';
import { gradeLabel, type QCGrade } from './gradeLabel';

interface DistributionBarProps {
    distribution: GradeDistribution;
    large?: boolean;
}

const DistributionBar: React.FC<DistributionBarProps> = ({ distribution, large }) => {
    const { t } = useTranslation();
    if (distribution.total === 0) return null;
    const h = large ? 'h-6' : 'h-3';

    const segments: { key: QCGrade; count: number; color: string }[] = [
        { key: 'A', count: distribution.A, color: 'bg-green-500' },
        { key: 'B', count: distribution.B, color: 'bg-blue-500' },
        { key: 'C', count: distribution.C, color: 'bg-amber-500' },
        { key: 'reject', count: distribution.reject, color: 'bg-red-500' },
    ];

    return (
        <div className={`w-full ${h} rounded-full overflow-hidden flex`}>
            {segments.map(seg =>
                seg.count > 0 ? (
                    <div
                        key={seg.key}
                        className={`${seg.color} transition-all dynamic-width`}
                        style={{ '--w': `${(seg.count / distribution.total) * 100}%` } as React.CSSProperties}
                        title={`${gradeLabel(t, seg.key)}: ${seg.count}`}
                    />
                ) : null
            )}
        </div>
    );
};

export default DistributionBar;
