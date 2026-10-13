/**
 * TeamLeaderPanel — Métricas de equipo, roster y compliance para Team Leaders
 * Extraído de PickerProfileDrawer.tsx
 */
import React, { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { Picker } from '@/types';

interface TeamLeaderPanelProps {
    leader: Picker;
    crew: Picker[];
    pieceRate: number;
    minWage: number;
}

const TeamLeaderPanel: React.FC<TeamLeaderPanelProps> = ({ leader, crew, pieceRate, minWage }) => {
    const { t } = useTranslation();

    const myPickers = useMemo(() =>
        crew.filter(p => p.team_leader_id === leader.id && (p.role === 'picker' || !p.role)),
        [crew, leader.id]
    );

    const activePickers = myPickers.filter(p => p.status === 'active');
    const totalBuckets = myPickers.reduce((s, p) => s + (p.total_buckets_today ?? 0), 0);
    const avgBuckets = myPickers.length > 0 ? Math.round(totalBuckets / myPickers.length) : 0;

    const belowMin = myPickers.filter(p => {
        const rate = p.hours && p.hours > 0 ? ((p.total_buckets_today ?? 0) * pieceRate) / p.hours : 0;
        return rate < minWage && rate > 0;
    });

    // Horas efectivas del TL — usa check_in si no hay hours registradas
    const tlHours = leader.hours && leader.hours > 0
        ? leader.hours
        : leader.check_in
            ? Math.max(0, (Date.now() - new Date(leader.check_in).getTime()) / 3600000)
            : 0;

    const belowMinLabel = belowMin.length === 1
        ? t('panel.tl.below_min_one').replace('{n}', String(belowMin.length))
        : t('panel.tl.below_min_many').replace('{n}', String(belowMin.length));

    const getStatusLabel = (status: string | undefined): string => {
        if (status === 'active') return t('panel.status.active');
        if (status === 'on_break') return t('panel.status.break');
        return t('panel.status.away');
    };

    return (
        <div className="space-y-4">
            {/* Stats del TL */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-sky-700">{tlHours.toFixed(1)}h</p>
                    <p className="text-[10px] text-sky-600 font-bold">{t('panel.tl.hours_today')}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-indigo-700">{myPickers.length}</p>
                    <p className="text-[10px] text-indigo-600 font-bold">{t('panel.tl.team_size')}</p>
                </div>
            </div>

            {/* Team Overview */}
            <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                    {t('panel.tl.overview')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-emerald-50 rounded-lg p-2 text-center">
                        <p className="text-xl font-black text-emerald-700">{activePickers.length}</p>
                        <p className="text-[9px] text-emerald-600 font-bold">{t('panel.tl.active')}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                        <p className="text-xl font-black text-slate-700">{totalBuckets}</p>
                        <p className="text-[9px] text-slate-500 font-bold">{t('panel.tl.team_bins')}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                        <p className="text-xl font-black text-slate-700">{avgBuckets}</p>
                        <p className="text-[9px] text-slate-500 font-bold">{t('panel.tl.avg_picker')}</p>
                    </div>
                </div>
            </div>

            {/* Alertas de compliance */}
            {belowMin.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm text-red-500">warning</span>
                        <p className="text-xs font-bold text-red-700">{belowMinLabel}</p>
                    </div>
                    <p className="text-[10px] text-red-600">{belowMin.map(p => p.name).join(', ')}</p>
                </div>
            )}

            {/* Roster del equipo */}
            {myPickers.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pt-3 pb-2">
                        {t('panel.tl.roster')}
                    </p>
                    <div className="divide-y divide-border-light max-h-48 overflow-y-auto">
                        {myPickers.map(p => (
                            <div key={p.id} className="flex items-center px-3 py-2 gap-2">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 shrink-0">
                                    {p.name?.charAt(0)}
                                </div>
                                <span className="text-xs font-medium text-text-main flex-1 truncate">{p.name}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {getStatusLabel(p.status)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold w-10 text-right">
                                    {p.total_buckets_today ?? 0} {t('panel.history.bins')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">chat</span>
                    {t('panel.tl.message_manager')}
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-50 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">campaign</span>
                    {t('panel.tl.broadcast')}
                </button>
            </div>
        </div>
    );
};

export default TeamLeaderPanel;
