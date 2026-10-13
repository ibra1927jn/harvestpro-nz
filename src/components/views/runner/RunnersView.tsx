import { selectPresentPickers } from '@/services/harvestMetrics/roster';
import React from 'react';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import EmptyState from '@/components/ui/EmptyState';
import { useTranslation } from '@/i18n';

interface RunnersViewProps {
    onBack: () => void;
}

const RunnersView: React.FC<RunnersViewProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const { crew, orchard } = useHarvest();

    // Pickers trabajando ahora (fichados y sin salida) — misma regla que Panel y Mapa
    const activePickers = selectPresentPickers(crew);

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* OmniCore Ambient Background */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

            <header className="pt-10 pb-6 px-6 flex items-center justify-between z-20 bg-white/70 backdrop-blur-xl sticky top-0 border-b border-white/50 shadow-[0_4px_30px_-5px_rgba(0,0,0,0.05)]">
                <button aria-label={t('common.back')}
                    onClick={onBack}
                    className="size-11 flex items-center justify-center rounded-2xl bg-white/80 border border-white/60 shadow-sm text-slate-600 active:scale-95 transition-all hover:bg-white hover:text-primary hover:shadow-md"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <div className="text-center">
                    <h1 className="text-xl font-black bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent uppercase tracking-tight">
                        {t('runner.crew.title')}
                    </h1>
                    <p className="text-[11px] text-primary font-bold tracking-widest uppercase mt-0.5">{orchard?.name || t('runner.crew.live_ops')}</p>
                </div>
                <div className="size-11"></div> {/* Spacer for symmetry */}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 z-10 pb-20 no-scrollbar relative">
                <div className="flex items-center justify-between px-1 mb-2">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('runner.crew.active_pickers')}</h2>
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-emerald-700 font-bold text-[10px] uppercase tracking-wider">{t('runner.crew.checked_in_n', { n: activePickers.length })}</span>
                    </div>
                </div>

                {activePickers.map(picker => (
                    <div 
                        key={picker.id} 
                        className="group relative bg-white/80 backdrop-blur-sm p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col gap-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white transition-all duration-300"
                    >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                        
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="relative size-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-xl font-black text-slate-400 border border-slate-200/60 shadow-inner uppercase overflow-hidden">
                                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] animate-[shimmer_2.5s_infinite]"></div>
                                    {picker.avatar}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-800 text-lg leading-tight tracking-tight">{picker.name}</h3>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="flex items-center justify-center size-5 rounded-full bg-primary/10">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[12px] text-primary filled">location_on</span>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-500 tracking-wide">{t('runner.row_n', { n: picker.current_row || '?' })}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 mt-1">
                                <div className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]"></div>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50 flex items-center justify-between group-hover:bg-slate-50 transition-colors">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{t('runner.crew.buckets')}</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-slate-800 tracking-tight">{picker.total_buckets_today || 0}</span>
                                    <span className="text-xs font-bold text-slate-400">{t('runner.crew.units')}</span>
                                </div>
                            </div>
                            <div className="size-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-primary">
                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">shopping_basket</span>
                            </div>
                        </div>
                    </div>
                ))}

                {activePickers.length === 0 && (
                    <div className="mt-8">
                        <EmptyState
                            icon="person_search"
                            title={t('runner.crew.empty_title')}
                            subtitle={orchard?.name
                                ? t('runner.crew.empty_desc', { orchard: orchard.name })
                                : t('runner.crew.no_orchard_desc')}
                            iconColor="text-emerald-400"
                            action={!orchard?.name ? {
                                label: t('common.go_back'),
                                onClick: onBack,
                                icon: 'arrow_back',
                            } : undefined}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default RunnersView;

