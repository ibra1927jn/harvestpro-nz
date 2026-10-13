import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate } from '@/utils/nzFormat';
import { roleLabel } from '@/i18n/roleLabel';

const ProfileView = () => {
    const { t } = useTranslation();
    const { currentUser, orchard, settings, crew } = useHarvestStore();
    const { logout, appUser } = useAuth();

    // Find the picker record to get the ID (number)
    const pickerRecord = crew.find(p => p.id === currentUser?.id);
    const pickerId = pickerRecord?.picker_id || 'N/A';

    return (
        <div className="bg-background-light min-h-screen pb-24">
            <div className="sticky top-0 z-30 bg-surface-white/95 backdrop-blur-sm border-b border-border-light pb-3 pt-4 shadow-sm">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div>
                            <h1 className="text-text-main text-lg font-bold leading-tight tracking-tight">{t('tl.profile.title')}</h1>
                            <p className="text-xs text-text-sub font-medium">
                                {formatNZDate(new Date(), 'weekdayShort')} • {t('tl.profile.session_active')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex size-2 bg-success rounded-full animate-pulse"></span>
                        <span className="text-xs font-semibold text-text-sub uppercase">{t('common.online')}</span>
                    </div>
                </div>
            </div>

            <div className="px-4 mt-6 space-y-6">
                {/* User Card */}
                <div className="bg-surface-white rounded-xl p-5 border border-border-light shadow-sm flex items-start gap-4">
                    <div className="size-16 rounded-full bg-background-light flex items-center justify-center text-primary-vibrant text-2xl font-bold border border-border-light">
                        {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'TL'}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-text-main font-bold text-lg leading-tight">
                            {currentUser?.name || appUser?.full_name || t('tl.profile.unknown_user')}
                        </h2>
                        <p className="text-sm text-text-sub font-medium">
                            {roleLabel(t, currentUser?.role || 'team_leader')} • ID: {pickerId}
                        </p>
                        <p className="text-xs text-text-sub mt-1">
                            {appUser?.email || ''}
                        </p>
                    </div>
                </div>

                {/* Day Configuration Settings (Mocked for now) */}
                <div>
                    <h3 className="text-text-main font-bold text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-primary-vibrant text-lg">tune</span>
                        {t('tl.profile.day_config')}
                    </h3>
                    <div className="bg-surface-white rounded-xl border border-border-light shadow-sm overflow-hidden p-5 space-y-5">
                        {/* Orchard Select */}
                        <div>
                            <label className="block text-xs font-bold text-text-sub uppercase tracking-wider mb-2">{t('tl.profile.current_orchard')}</label>
                            <div className="relative">
                                <select aria-label={t('tl.profile.current_orchard')} className="w-full appearance-none bg-background-light border border-border-light text-text-main font-bold py-3 px-4 rounded-xl focus:border-primary-vibrant focus:ring-1 focus:ring-primary-vibrant outline-none text-sm">
                                    <option>{orchard?.name || t('common.loading')}</option>
                                    <option disabled>{t('tl.profile.switching_disabled')}</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-text-sub">
                                    <span aria-hidden="true" className="material-symbols-outlined">expand_more</span>
                                </div>
                            </div>
                        </div>

                        {/* Stats Readout */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-text-sub uppercase tracking-wider mb-1.5">{t('tl.piece_rate')}</label>
                                <div className="w-full rounded-lg bg-background-light border border-border-light text-text-main font-mono font-black py-2.5 px-3">
                                    {t('tl.per_bin', { amount: formatNZD(settings?.piece_rate ?? 0) })}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-sub uppercase tracking-wider mb-1.5">{t('tl.min_wage')}</label>
                                <div className="w-full rounded-lg bg-background-light border border-border-light text-text-main font-mono font-black py-2.5 px-3">
                                    {t('tl.per_hour', { amount: formatNZD(settings?.min_wage_rate ?? 0) })}
                                </div>
                            </div>
                        </div>

                        {/* Offline Toggle */}
                        <div className="flex items-center justify-between pt-2">
                            <span className="text-sm font-bold text-text-main">{t('tl.profile.offline_mode')}</span>
                            <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                <input type="checkbox" name="toggle" id="toggle" aria-label={t('tl.profile.offline_mode')} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-border-light" />
                                <label htmlFor="toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-slate-300 cursor-pointer"></label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                    <button className="w-full bg-surface-white border-2 border-primary-vibrant/20 hover:border-primary-vibrant text-primary-vibrant font-bold py-3.5 px-4 rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined">flag</span>
                        {t('tl.profile.end_of_day')}
                    </button>

                    <button
                        onClick={logout}
                        className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined">logout</span>
                        {t('common.sign_out')}
                    </button>
                </div>

                {/* i18n-ignore: número de versión */}
                <p className="text-center text-[10px] text-text-sub font-mono mt-4">
                    HarvestPro NZ v1.2.0 • Build 2024
                </p>
            </div>
        </div>
    );
};

export default ProfileView;
