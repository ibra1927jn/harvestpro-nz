/**
 * ActivityHistoryView — Role-aware activity/history panel
 * Picker: scan history, pace, earnings
 * Team Leader: team member list with stats
 * Runner: collection log
 */
import React, { useMemo } from 'react';
import { Picker } from '../../../types';
import { isPicker, isTeamLeader } from './roleUtils';
import { useTranslation } from '@/i18n';
import { formatNZD } from '@/utils/nzFormat';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

interface ActivityHistoryViewProps {
    picker: Picker;
    role: string;
    pieceRate: number;
    allCrew: Picker[];
    onBack: () => void;
}

const ActivityHistoryView: React.FC<ActivityHistoryViewProps> = React.memo(({
    picker,
    role,
    pieceRate,
    allCrew,
    onBack,
}) => {
    const { t } = useTranslation();
    const earnings = picker.total_buckets_today * pieceRate;
    const speed = picker.hours && picker.hours > 0
        ? Math.round(picker.total_buckets_today / picker.hours) : 0;
    const hourlyRate = picker.hours && picker.hours > 0 ? earnings / picker.hours : 0;
    const minWage = PAY_RULES.minWageFloor; // NZ Minimum Wage 2026-2027
    const isAboveMinimum = hourlyRate >= minWage;

    const teamMembers = useMemo(() => {
        if (!isTeamLeader(role)) return [];
        return allCrew.filter(p => p.team_leader_id === picker.id && isPicker(p.role || 'picker'));
    }, [allCrew, picker.id, role]);

    const sectionTitle = isPicker(role) ? t('pd.scan_history') : isTeamLeader(role) ? t('pd.team_activity') : t('pd.collection_log');
    const rowText = picker.current_row ? t('runner.row_n', { n: picker.current_row }) : t('panel.picker.not_assigned');

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
                <button aria-label={t('common.back')} onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{sectionTitle}</p>
            </div>

            {isPicker(role) ? (
                picker.total_buckets_today > 0 ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3 p-3 bg-indigo-50 rounded-xl">
                            <span className="text-sm font-bold text-indigo-700">{t('pd.today_total')}</span>
                            <span className="text-lg font-black text-indigo-700">{t('pd.buckets_n', { n: picker.total_buckets_today })}</span>
                        </div>
                        <div className="space-y-1.5">
                            <HistoryRow icon="schedule" label={t('pd.check_in')} value={picker.hours ? t('pd.hours_ago', { n: picker.hours.toFixed(1) }) : t('common.na')} />
                            <HistoryRow icon="pin_drop" label={t('pd.current_location')} value={rowText} />
                            <HistoryRow icon="speed" label={t('pd.current_pace')} value={`${t('pd.buckets_per_hr', { n: speed })} — ${isAboveMinimum ? `✅ ${t('pd.above_min')}` : `⚠️ ${t('pd.below_min')}`}`} />
                            <HistoryRow icon="payments" label={t('pd.est_earnings')} value={`${formatNZD(earnings)} (${picker.total_buckets_today} × ${formatNZD(pieceRate)})`} />
                        </div>
                    </div>
                ) : (
                    <EmptyHistory message={t('pd.no_activity')} sub={t('pd.no_activity_sub')} />
                )
            ) : isTeamLeader(role) ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3 p-3 bg-emerald-50 rounded-xl">
                        <span className="text-sm font-bold text-emerald-700">{t('pd.team_summary')}</span>
                        <span className="text-lg font-black text-emerald-700">
                            {t('pd.buckets_n', { n: teamMembers.reduce((s, p) => s + (p.total_buckets_today || 0), 0) })}
                        </span>
                    </div>
                    {teamMembers.length > 0 ? teamMembers.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                            <div className="size-8 rounded-lg bg-white flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200">
                                {member.avatar || member.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{member.name}</p>
                                <p className="text-[11px] text-slate-500">{t('pd.buckets_n', { n: member.total_buckets_today })} • {member.hours?.toFixed(1) || '0'}h</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-slate-900">{formatNZD(member.total_buckets_today * pieceRate, 0)}</p>
                            </div>
                        </div>
                    )) : (
                        <EmptyHistory message={t('pd.no_team_pickers')} icon="group_off" />
                    )}
                </div>
            ) : (
                /* Runner activity */
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3 p-3 bg-amber-50 rounded-xl">
                        <span className="text-sm font-bold text-amber-700">{t('pd.today_runs')}</span>
                        <span className="text-lg font-black text-amber-700">{t('pd.collected_n', { n: picker.total_buckets_today })}</span>
                    </div>
                    <HistoryRow icon="pin_drop" label={t('panel.picker.current_row')} value={rowText} />
                    <HistoryRow icon="schedule" label={t('pd.hours_on_site')} value={t('pd.hours_today', { n: picker.hours?.toFixed(1) || '0' })} />
                </div>
            )}
        </div>
    );
});

ActivityHistoryView.displayName = 'ActivityHistoryView';

/* ── Tiny helpers ── */
const HistoryRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
        <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-[18px]">{icon}</span>
        <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">{label}</p>
            <p className="text-[11px] text-slate-500">{value}</p>
        </div>
    </div>
);

const EmptyHistory: React.FC<{ message: string; sub?: string; icon?: string }> = ({ message, sub, icon = 'inbox' }) => (
    <div className="text-center py-8">
        <span aria-hidden="true" className="material-symbols-outlined text-slate-300 text-4xl mb-2">{icon}</span>
        <p className="text-slate-500 font-medium">{message}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
);

export default ActivityHistoryView;
