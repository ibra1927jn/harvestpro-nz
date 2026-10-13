import React from 'react';
import { useTranslation } from '@/i18n';
import EntityId from '@/components/primitives/EntityId';

interface TeamsToolbarProps {
    orchardId?: string;
    usersCount: number;
    setIsAddTeamLeaderModalOpen: (open: boolean) => void;
    setShowImportCSV: (show: boolean) => void;
    /** Importar pickers por CSV: no para el manager (altas = team leader o RRHH) */
    canImportPickers?: boolean;
    search: string;
    setSearch: (value: string) => void;
}

const TeamsToolbar: React.FC<TeamsToolbarProps> = ({
    orchardId,
    usersCount,
    setIsAddTeamLeaderModalOpen,
    setShowImportCSV,
    canImportPickers = false,
    search,
    setSearch
}) => {
    const { t } = useTranslation();
    return (
        <div className="glass-header px-6 py-5 space-y-4">
            {/* Top Row */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-text-main flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-indigo-500">groups_3</span>
                        {t('teams.header')}
                    </h2>
                    <p className="text-xs text-text-muted mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            {t('teams.staff_loaded').replace('{n}', String(usersCount))}
                        </span>
                        <span className="text-slate-300">•</span>
                        {orchardId ? (
                            <EntityId id={orchardId} chars={6} className="text-slate-400" />
                        ) : (
                            <span className="text-[10px] text-slate-400">{t('teams.no_orchard')}</span>
                        )}
                    </p>
                </div>

                <div className="flex gap-2">
                    {/* Link Staff button — opens modal for TL + Runners */}
                    <button
                        onClick={() => setIsAddTeamLeaderModalOpen(true)}
                        disabled={!orchardId}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 ${orchardId
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-border-light'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">person_add</span>
                        {t('teams.link_staff')}
                    </button>


                    {/* Import CSV */}


                    {canImportPickers && (
                    <button
                        onClick={() => setShowImportCSV(true)}
                        disabled={!orchardId}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 ${orchardId
                            ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:scale-95'
                            : 'bg-slate-50 text-slate-400 cursor-not-allowed border border-border-light'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">upload</span>
                        {t('teams.import_csv')}
                    </button>


                    )}
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                    placeholder={t('teams.search_placeholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-text-main placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all duration-200 shadow-sm"
                />
            </div>
        </div>
    );
};

export default TeamsToolbar;
