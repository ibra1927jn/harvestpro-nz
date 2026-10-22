import { buttonLike } from '@/utils/pressable';
import { useMemo, useState, Suspense } from 'react';
import { LazyAccountSheet as AccountSheet } from '@/components/common/account/lazyAccountSheet';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { useHarvestMetrics } from '@/hooks/useHarvestMetrics';
import { selectTeamOf, selectPresentPickers } from '@/services/harvestMetrics/roster';
import { UnclosedShiftsAlert } from '@/components/common/UnclosedShiftsAlert';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate } from '@/utils/nzFormat';

const HomeView = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => {
    const { t } = useTranslation();
    // El avatar abre «Mi cuenta» (antes llevaba a la pestaña 'profile', que ya no existe: pantalla en blanco)
    const [accountOpen, setAccountOpen] = useState(false);
    const { stats, crew: orchardCrew, settings, openPickerProfile } = useHarvest();
    const { appUser } = useAuth();
    const currentUser = appUser ? { name: appUser.full_name, id: appUser.id } : null;

    // 1. Mi equipo (misma regla que Equipos del manager) y quién está trabajando ahora
    const crew = useMemo(() => selectTeamOf(orchardCrew, appUser?.id), [orchardCrew, appUser?.id]);
    const totalCrew = selectPresentPickers(crew).length;
    const teamBuckets = crew.reduce((sum, p) => sum + (p.total_buckets_today || 0), 0);
    // Pago estimado de MI equipo hoy (mismo cálculo que el panel del manager)
    const { perPicker } = useHarvestMetrics();
    const teamPay = useMemo(() => {
        const ids = new Set(crew.map(p => p.id));
        return perPicker.filter(m => ids.has(m.pickerId)).reduce((sum, m) => sum + m.earned, 0);
    }, [perPicker, crew]);

    // 2. Safety Status (Real Monitor)
    const safetyIssuePicker = crew.find(p => p.status === 'suspended' || p.status === 'issue');
    const safetyStatus = safetyIssuePicker ? 'issue' : 'safe';

    // 3. Performance Analytics (Real Goal)
    const dailyGoalPerPicker = (settings?.min_buckets_per_hour || 3.6) * 8; 
    const currentAvg = totalCrew > 0 ? (teamBuckets / totalCrew) : 0;
    const progressPercent = Math.min((currentAvg / dailyGoalPerPicker) * 100, 100);

    const cards = [
        { label: t('tl.home.buckets'), value: teamBuckets, icon: 'shopping_basket', color: 'primary' },
        { label: t('tl.home.pay_est'), value: formatNZD(teamPay, 0), icon: 'payments', color: 'text-main' },
        { label: t('tl.home.tons'), value: stats.tons.toFixed(1), icon: 'scale', color: 'text-main' },
    ];

    const rankedCrew = useMemo(() => {
        return [...crew].sort((a, b) => (b.total_buckets_today || 0) - (a.total_buckets_today || 0));
    }, [crew]);

    return (
        <div className="bg-slate-50 min-h-screen pb-24 font-sans selection:bg-primary/20">
            {crew.length > 0 && (
                <div className="px-4 pt-4">
                    <UnclosedShiftsAlert pickerIds={crew.map(p => p.id)} hint={t('tl.home.unclosed_hint')} />
                </div>
            )}
            {/* Header Section - Glassmorphic */}
            <div className="sticky top-0 z-30 px-6 pt-12 pb-6 bg-white/70 backdrop-blur-xl border-b border-white/50 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                    <div className="group">
                        <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 tracking-tight transition-all duration-300 group-hover:opacity-80">
                            {t('tl.home.greeting', { name: currentUser?.name?.split(' ')[0] || t('panel.role.team_leader') })}
                        </h1>
                        <p className="text-slate-500 font-medium mt-1">
                            {formatNZDate(new Date(), 'weekday')}
                        </p>
                    </div>
                    <div
                        {...buttonLike(() => setAccountOpen(true), t('tl.home.open_profile'))}
                        className="size-12 rounded-full bg-gradient-to-tr from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20 shadow-inner cursor-pointer hover:scale-105 transition-transform duration-300 ring-4 ring-white"
                    >
                        <span className="text-primary font-bold text-sm tracking-wider">
                            {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'TL'}
                        </span>
                    </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-3 gap-4">
                    {cards.map((card, i) => (
                        <KpiCard key={i} {...card} />
                    ))}
                </div>
            </div>

            <div className="px-5 mt-6 space-y-6">
                {/* 1. SAFETY MONITOR (REAL DATA) */}
                <div
                    onClick={() => onNavigate && onNavigate('team')}
                    className={`relative overflow-hidden rounded-2xl p-5 border shadow-sm flex items-center justify-between transition-all duration-300 cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] ${safetyStatus === 'issue'
                        ? 'bg-red-50/80 border-red-200 backdrop-blur-md' 
                        : 'bg-white/80 border-emerald-100 backdrop-blur-md'
                        }`}>
                    
                    {/* Decorative gradient orb */}
                    <div className={`absolute -right-10 -top-10 size-32 rounded-full blur-3xl opacity-20 pointer-events-none ${safetyStatus === 'issue' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>

                    <div className="relative z-10">
                        <h3 className={`font-bold text-lg tracking-tight ${safetyStatus === 'issue' ? 'text-red-800' : 'text-slate-800'}`}>
                            {safetyStatus === 'issue' ? t('tl.home.action_required') : t('tl.home.morning_huddle')}
                        </h3>
                        <p className={`text-xs font-semibold mt-1 ${safetyStatus === 'issue' ? 'text-red-600' : 'text-slate-500'}`}>
                            {safetyStatus === 'issue'
                                ? t('tl.home.check_picker', { name: safetyIssuePicker?.name ?? '', status: safetyIssuePicker?.status === 'suspended' ? t('tl.status.suspended') : t('tl.status.issue') })
                                : t('tl.home.all_verified')
                            }
                        </p>
                    </div>
                    <div className={`relative z-10 size-12 rounded-full flex items-center justify-center shadow-inner ${safetyStatus === 'issue' ? 'bg-red-100 text-red-600 ring-4 ring-red-50' : 'bg-emerald-50 text-emerald-500 ring-4 ring-white'
                        }`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-2xl">
                            {safetyStatus === 'issue' ? 'warning' : 'check_circle'}
                        </span>
                    </div>
                </div>

                {/* 2. PERFORMANCE ANALYTICS (REAL GOAL) */}
                <div onClick={() => onNavigate && onNavigate('tasks')} className="cursor-pointer group">
                    <div className="flex justify-between items-end mb-3 px-1">
                        <h2 className="text-slate-800 font-bold text-lg tracking-tight">{t('tl.home.crew_performance')}</h2>
                        <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('tl.home.team_target')}</span>
                            <p className="text-xs font-bold text-primary">
                                {t('tl.home.bkt_per_hr', { n: settings?.min_buckets_per_hour || 3.6 })}
                            </p>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:border-slate-200">
                        <div className="flex justify-between text-sm font-bold text-slate-500 mb-3">
                            <span>{t('tl.home.daily_progress')}</span>
                            <span className="text-slate-800">{Math.round(progressPercent)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200/50 shadow-inner">
                            <div
                                className="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-primary via-rose-500 to-orange-400 relative"
                                style={{ width: `${progressPercent}%` }}
                            >
                                {/* Shimmer effect overlay */}
                            </div>
                        </div>
                        <p className="text-center text-[11px] text-slate-500 font-medium mt-4 tracking-wide">
                            {progressPercent < 50 ? t('tl.home.pace_slow') : t('tl.home.pace_good')}
                        </p>
                    </div>
                </div>

                {/* MY CREW LIST */}
                <section>
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 tracking-tight">
                            <div className="p-1.5 bg-primary/10 rounded-lg text-primary flex items-center justify-center">
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">group</span>
                            </div>
                            {t('tl.home.active_crew', { n: totalCrew })}
                        </h3>
                        <button
                            onClick={() => onNavigate && onNavigate('team')}
                            className="text-primary text-xs font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                        >
                            {t('tl.home.view_all')}
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* Tocar a un picker abre su cajón de perfil (Hoy / Historial / Calidad), igual que en Manager */}
                        {rankedCrew.slice(0, 5).map((picker, idx) => (
                            <button
                                key={picker.id}
                                type="button"
                                onClick={() => openPickerProfile(picker.id)}
                                aria-label={t('tl.picker.open_profile', { name: picker.name })}
                                className="group w-full text-left bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/60 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="size-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold border border-slate-300/50 text-sm shadow-inner group-hover:scale-105 transition-transform duration-300">
                                        {picker.avatar || (picker.name || '??').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-800 leading-tight group-hover:text-primary transition-colors">{picker.name}</span>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            {/* Row/Bench Status */}
                                            {!picker.orchard_id ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                    {t('tl.bench')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                                                    {t('runner.row_n', { n: picker.current_row || '-' })}
                                                </span>
                                            )}

                                            {/* QC Dots */}
                                            <div className="flex gap-1 ml-1">
                                                {(picker.qcStatus || [1, 1, 1]).map((status, i) => (
                                                    <div key={i} className={`size-1.5 rounded-full shadow-sm ${status === 1 ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="block text-2xl font-black text-slate-800 leading-none">
                                        {picker.total_buckets_today || 0}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">{t('tl.home.buckets')}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
            {accountOpen && (
                <Suspense fallback={null}>
                    <AccountSheet onClose={() => setAccountOpen(false)} />
                </Suspense>
            )}
        </div>
    );
};

interface KpiCardProps {
    label: string;
    value: string | number;
    icon: string;
    color: string;
}

const KpiCard = ({ label, value, icon, color }: KpiCardProps) => {
    const isPrimary = color === 'primary';
    return (
        <div className={`relative overflow-hidden p-4 rounded-2xl border backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1 flex flex-col items-center justify-center h-28 ${
            isPrimary ? 'bg-primary border-primary text-white' : 'bg-white/80 border-white/60 text-slate-800'
        }`}>
            {/* Background decor for primary card */}
            {isPrimary && (
                <div className="absolute -right-4 -top-4 size-16 bg-white opacity-10 rounded-full blur-xl"></div>
            )}
            
            <span aria-hidden="true" className={`material-symbols-outlined text-2xl mb-1.5 ${isPrimary ? 'text-white' : 'text-slate-400'}`}>
                {icon}
            </span>
            <span className="text-xl font-black tracking-tight mb-0.5">
                {value}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isPrimary ? 'text-white/80' : 'text-slate-400'}`}>{label}</span>
        </div>
    );
};

export default HomeView;
