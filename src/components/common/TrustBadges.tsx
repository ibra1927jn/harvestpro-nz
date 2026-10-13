/**
 * ============================================
 * TRUST BADGES — Enterprise Status Indicators
 * ============================================
 * Visual indicators of system health displayed
 * at the top of the Manager dashboard.
 * Shows: Security, Sync, Compliance, Uptime
 * ============================================
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { useHarvestStore } from '../../stores/useHarvestStore';
import { formatNZNumber } from '@/utils/nzFormat';

interface BadgeProps {
    icon: React.ReactNode;
    label: string;
    variant: 'success' | 'info' | 'warning' | 'neutral';
}

const variantStyles: Record<BadgeProps['variant'], string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    neutral: 'bg-background-light text-text-secondary border-border-light',
};

const Badge: React.FC<BadgeProps> = ({ icon, label, variant }) => (
    <div className={`
        inline-flex items-center gap-2 px-3 py-1.5
        text-xs font-semibold whitespace-nowrap shrink-0
        border rounded-full
        ${variantStyles[variant]}
    `}>
        {icon}
        <span>{label}</span>
    </div>
);

export const TrustBadges: React.FC = () => {
    const { t } = useTranslation();
    const crewCount = useHarvestStore(s => s.crew?.length ?? 0);
    const recordCount = useHarvestStore(s => s.bucketRecords?.length ?? 0);
    const alertCount = useHarvestStore(s => s.alerts?.length ?? 0);

    return (
        // Fila con scroll horizontal: enfocable para poder desplazarla con teclado
        <div role="region" aria-label={t('trust.system_status')} tabIndex={0} className="flex gap-2 mb-4 overflow-x-auto md:flex-wrap no-scrollbar pb-1">
            <Badge
                icon={<span aria-hidden="true" className="material-symbols-outlined text-sm">shield</span>}
                label={t('dashboard.trust.rls')}
                variant="success"
            />
            <Badge
                icon={<span aria-hidden="true" className="material-symbols-outlined text-sm">database</span>}
                label={t('dashboard.trust.records').replace('{n}', String(recordCount > 0 ? formatNZNumber(recordCount) : crewCount))}
                variant="info"
            />
            <Badge
                icon={<span aria-hidden="true" className="material-symbols-outlined text-sm">check_circle</span>}
                label={alertCount > 0 ? t('dashboard.trust.alerts').replace('{n}', String(alertCount)) : t('dashboard.trust.compliant')}
                variant={alertCount > 0 ? 'warning' : 'success'}
            />
            <Badge
                icon={<span aria-hidden="true" className="material-symbols-outlined text-sm">schedule</span>}
                label={t('dashboard.trust.live')}
                variant="neutral"
            />
        </div>
    );
};

export default TrustBadges;
