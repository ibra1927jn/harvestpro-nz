import React, { useState } from 'react';
import { Picker } from '../../../../types';
import EmptyState from '@/components/ui/EmptyState';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';

interface RunnersSectionProps {
    runners: Picker[];
    onSelectUser: (user: Picker) => void;
    onRemoveUser?: (userId: string) => Promise<void>;
}

const RUNNER_COLORS = [
    { bg: 'bg-blue-500/20', text: 'text-blue-500' },
    { bg: 'bg-emerald-500/20', text: 'text-emerald-500' },
    { bg: 'bg-purple-500/20', text: 'text-purple-500' },
    { bg: 'bg-rose-500/20', text: 'text-rose-500' },
    { bg: 'bg-amber-500/20', text: 'text-amber-500' },
    { bg: 'bg-cyan-500/20', text: 'text-cyan-500' },
    { bg: 'bg-indigo-500/20', text: 'text-indigo-500' },
    { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-500' },
    { bg: 'bg-teal-500/20', text: 'text-teal-500' },
    { bg: 'bg-orange-500/20', text: 'text-orange-500' },
];

const getRunnerColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return RUNNER_COLORS[Math.abs(hash) % RUNNER_COLORS.length];
};

// Retorna clave de traduccion en lugar de string hardcodeado
const getStatusInfo = (runner: Picker) => {
    const s = runner.status?.toLowerCase() || '';
    if (s === 'active' || s === 'online') return { dot: 'bg-emerald-400', key: 'teams.status_active' as const };
    if (s === 'break' || s === 'on_break') return { dot: 'bg-amber-400', key: 'teams.status_break' as const };
    if (s === 'idle') return { dot: 'bg-slate-300', key: 'teams.status_idle' as const };
    return { dot: 'bg-emerald-400', key: 'teams.status_active' as const };
};

const RunnersSection: React.FC<RunnersSectionProps> = ({ runners, onSelectUser, onRemoveUser }) => {
    const { t } = useTranslation();
    const [unlinking, setUnlinking] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const handleUnlink = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();
        if (!onRemoveUser) return;

        // Two-click pattern: first click shows confirm, second click executes
        if (confirmId !== userId) {
            setConfirmId(userId);
            setTimeout(() => setConfirmId(prev => prev === userId ? null : prev), 3000);
            return;
        }

        setConfirmId(null);
        setUnlinking(userId);
        try {
            await onRemoveUser(userId);
        } catch (err) {
            logger.error('Unlink runner failed:', err);
        } finally {
            setUnlinking(null);
        }
    };

    return (
        <section className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-text-main flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-blue-500">local_shipping</span>
                    {t('teams.active_runners')}
                </h3>
                <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                    {runners.length === 1
                        ? t('teams.active_one').replace('{n}', '1')
                        : t('teams.active_other').replace('{n}', String(runners.length))}
                </span>
            </div>

            {runners.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {runners.map((runner, i) => {
                        const color = getRunnerColor(runner.name || '');
                        const status = getStatusInfo(runner);
                        return (
                            <div
                                key={runner.id}
                                onClick={() => onSelectUser(runner)}
                                className={`p-4 rounded-xl border border-border-light bg-slate-50 flex items-center justify-between group card-hover cursor-pointer list-item-enter stagger-${Math.min(i + 1, 8)}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className={`w-10 h-10 rounded-full ${color.bg} flex items-center justify-center ${color.text} font-bold`}>
                                            {runner.avatar || runner.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${status.dot} rounded-full border-2 border-white`} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-text-main text-sm">{runner.name}</h4>
                                        <p className="text-xs text-slate-400 font-medium">{t(status.key)} · {t('teams.bucket_runner')}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {/* Unlink button — two-click confirmation */}
                                    {onRemoveUser && (
                                        <button
                                            onClick={(e) => handleUnlink(e, runner.id)}
                                            disabled={unlinking === runner.id}
                                            className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all duration-200 active:scale-90 ${confirmId === runner.id
                                                ? 'bg-red-500 text-white shadow-sm opacity-100'
                                                : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                                                }`}
                                            title={confirmId === runner.id ? t('teams.confirm_q') : 'Unlink from orchard'}
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-sm">
                                                {unlinking === runner.id ? 'hourglass_top' : 'link_off'}
                                            </span>
                                            {confirmId === runner.id && <span className="text-[10px]">{t('teams.confirm_q')}</span>}
                                        </button>
                                    )}
                                    <span aria-hidden="true" className="material-symbols-outlined text-slate-300 group-hover:text-blue-500 transition-colors">
                                        chevron_right
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon="local_shipping"
                    title={t('teams.no_runners_assigned')}
                    subtitle={t('teams.no_runners_sub')}
                    compact
                    iconColor="text-blue-400"
                />
            )}
        </section>
    );
};

export default RunnersSection;
