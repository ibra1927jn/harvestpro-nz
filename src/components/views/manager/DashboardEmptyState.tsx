/**
 * DashboardEmptyState — Shown when no crew or bucket data exists
 */
import React from 'react';
import { Tab } from '../../../types';
import { SimulationBanner } from '../../SimulationBanner';
import { TrustBadges } from '../../common/TrustBadges';
import { useTranslation } from '@/i18n';

interface DashboardEmptyStateProps {
    setActiveTab: (tab: Tab) => void;
}

const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({ setActiveTab }) => {
    const { t } = useTranslation();
    return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24 animate-fade-in">
        <SimulationBanner />
        <TrustBadges />
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mb-6">
                <span aria-hidden="true" className="material-symbols-outlined text-4xl text-indigo-400">agriculture</span>
            </div>
            <h2 className="text-2xl font-black text-text-main mb-2">{t('mgr.empty_title')}</h2>
            <p className="text-text-muted max-w-md mb-8">
                {t('mgr.empty_desc')}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={() => setActiveTab('teams')}
                    className="gradient-primary glow-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">group_add</span>
                    {t('mgr.add_pickers')}
                </button>
                <button
                    onClick={() => setActiveTab('map')}
                    className="glass-card text-text-sub px-5 py-2.5 font-bold text-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">map</span>
                    {t('mgr.view_map')}
                </button>
            </div>
        </div>
    </div>
);
};

export default DashboardEmptyState;
