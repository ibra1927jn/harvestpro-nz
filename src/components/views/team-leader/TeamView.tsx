import { activateOnKey } from '@/utils/pressable';
import React, { useState, useMemo } from 'react';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import { Picker } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { selectTeamOf, isPresentToday } from '@/services/harvestMetrics/roster';
import AddPickerModal from '../../modals/AddPickerModal';
import PickerDetailsModal from '../../modals/PickerDetailsModal';
import { ElsewhereBadge } from '@/components/common/ElsewhereBadge';
import { useTranslation } from '@/i18n';

const TeamView = () => {
    const { t } = useTranslation();
    const {
        crew,
        addPicker,
        removePicker,
        updatePicker,
    } = useHarvest();
    // Usuario que ha iniciado sesión (store.currentUser no se rellena nunca)
    const { appUser } = useAuth();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedPicker, setSelectedPicker] = useState<Picker | null>(null);
    const [showInactive, setShowInactive] = useState(false);

    // Filter Logic - GLOBAL ROSTER
    // We show all pickers assigned to this TL.
    // 'Active' means they are active in the system (not archived), regardless of orchard assignment.
    const displayedCrew = useMemo(() => {
        // Option 1: Filter by current TL if we are in TL mode
        // Note: Managers see 'all leaders' in TeamsView, but TLs see 'their crew' in TeamView.
        // We filter context crew to show only what belongs to this appUser
        // Mi equipo = mis pickers (misma regla que Equipos del manager)
        const team = selectTeamOf(crew, appUser?.id);
        return showInactive ? team : team.filter(p => isPresentToday(p) || !p.check_out);
    }, [crew, appUser?.id, showInactive]);

    // Calculate stats
    const totalCrew = displayedCrew.length;
    const activeCrew = displayedCrew.filter(isPresentToday).length;
    const pendingCrew = displayedCrew.filter(p => !p.safety_verified).length;

    const handleDelete = async (e: React.MouseEvent, pickerId: string, pickerName: string) => {
        e.stopPropagation();
        if (window.confirm(t('tl.team.confirm_remove', { name: pickerName }))) {
            await removePicker(pickerId);
        }
    };

    return (
        <div className="relative">
            <div className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-white/50 pb-3 pt-4 shadow-[0_4px_30px_-5px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                        <div>
                            <h1 className="text-slate-800 text-lg font-black leading-tight tracking-tight">{t('tl.team.title')}</h1>
                            <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-0.5">{t('tl.team.subtitle')}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100 hover:bg-white hover:shadow-sm transition-all">
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                                className="accent-primary size-3.5"
                            />
                            {t('panel.tabs.history')}
                        </label>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 px-5 mt-1">
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 shadow-[0_4px_12px_rgb(0,0,0,0.03)]">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{t('tl.team.total')}</span>
                        <span className="text-slate-800 text-xl font-black font-mono tracking-tight">{totalCrew}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 shadow-[0_4px_12px_rgb(0,0,0,0.03)]">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{t('common.active')}</span>
                        <span className="text-emerald-600 text-xl font-black font-mono tracking-tight">{activeCrew}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-amber-50/60 backdrop-blur-md border border-amber-200/40 shadow-[0_4px_12px_rgb(245,158,11,0.04)]">
                        <span className="text-[10px] text-amber-600/80 uppercase tracking-widest font-bold">{t('tl.team.pending')}</span>
                        <span className="text-amber-600 text-xl font-black font-mono tracking-tight">{pendingCrew}</span>
                    </div>
                </div>
            </div>

            <div className="px-5 mt-6 space-y-3 pb-24">
                {displayedCrew.length === 0 ? (
                    <div className="text-center py-12 opacity-60">
                        <div className="mx-auto size-16 bg-slate-50 rounded-2xl shadow-inner border border-slate-100 flex items-center justify-center mb-4">
                            <span aria-hidden="true" className="material-symbols-outlined text-[32px] text-slate-300">group_off</span>
                        </div>
                        <p className="text-sm font-extrabold text-slate-500 tracking-tight">{t('tl.team.empty')}</p>
                        {!showInactive && <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-2">{t('tl.team.empty_hint')}</p>}
                    </div>
                ) : (
                    displayedCrew.map(picker => (
                        <div
                            key={picker.id}
                            onClick={() => setSelectedPicker(picker)}
                            tabIndex={0}
                            onKeyDown={activateOnKey(() => setSelectedPicker(picker))}
                            className={`bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white cursor-pointer transition-all duration-300 active:scale-[0.99] ${picker.status === 'inactive' ? 'opacity-60 grayscale' : ''}`}
                        >
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="size-12 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center font-black text-slate-400 text-base overflow-hidden border border-slate-200/60 shadow-inner">
                                        {picker.avatar || (picker.name || '??').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-slate-800 font-extrabold text-base tracking-tight flex items-center gap-1.5 flex-wrap">{picker.name}<ElsewhereBadge person={picker} /></h3>
                                            {(picker.total_buckets_today || 0) > 20 &&
                                                <span aria-hidden="true" className="material-symbols-outlined text-amber-500 text-[16px] fill-current">star</span>
                                            }
                                            {picker.status === 'inactive' &&
                                                <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-lg uppercase font-bold tracking-widest ml-2 border border-slate-200">{t('tl.team.archived')}</span>
                                            }
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase ${picker.safety_verified ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                {picker.safety_verified ? t('tl.team.onboarded') : t('tl.team.pending')}
                                            </span>
                                            {!picker.orchard_id ? (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase bg-slate-50 text-slate-500 border border-slate-100">
                                                    {t('tl.bench')}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase text-primary bg-primary/5 border border-primary/10">{t('runner.row_n', { n: picker.current_row || '—' })}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1.5">
                                    <div>
                                        <span className="block text-2xl font-black text-slate-800 leading-none tracking-tight">{picker.total_buckets_today || 0}</span>
                                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 block">{t('tl.home.buckets')}</span>
                                    </div>
                                    <button aria-label={t('tl.team.delete_name', { name: picker.name })}
                                        onClick={(e) => handleDelete(e, picker.id, picker.name)}
                                        className="size-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-all border border-red-100/50"
                                        title={t('tl.team.delete_title')}
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">delete</span>
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/50">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1.5">{t('tl.team.picker_id')}</label>
                                    <div className="relative">
                                        <input className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono font-black text-slate-700 pointer-events-none" type="text" readOnly value={picker.picker_id} aria-label={t('tl.team.picker_id')} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-primary tracking-widest block mb-1.5">{t('tl.team.harness_no')}</label>
                                    <div className="relative">
                                        <input
                                            className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono font-black text-primary uppercase focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                                            type="text"
                                            defaultValue={picker.harness_id || ''}
                                            placeholder={t('tl.team.assign_placeholder')}
                                            onBlur={(e) => {
                                                if (e.target.value !== picker.harness_id) {
                                                    updatePicker(picker.id, { harness_id: e.target.value.toUpperCase() });
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                <div className="fixed bottom-24 left-0 w-full px-5 pb-2 z-40 pointer-events-none">
                    <div className="pointer-events-auto">
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="w-full bg-primary hover:opacity-90 text-white text-sm font-black uppercase tracking-widest py-4 rounded-2xl shadow-[0_10px_30px_rgba(255,31,61,0.3)] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all border border-white/10"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">person_add</span>
                            {t('tl.team.add_picker')}
                        </button>
                    </div>
                </div>
            </div>

            {isAddModalOpen && (
                <AddPickerModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={addPicker}
                />
            )}

            {selectedPicker && (
                <PickerDetailsModal
                    picker={selectedPicker}
                    onClose={() => setSelectedPicker(null)}
                    onDelete={removePicker}
                    onUpdate={updatePicker}
                    allCrew={displayedCrew}
                />
            )}
        </div>
    );
};

export default TeamView;
