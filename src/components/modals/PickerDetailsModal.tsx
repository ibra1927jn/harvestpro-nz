/**
 * PickerDetailsModal — Thin Orchestrator
 * 
 * Role-aware profile modal that delegates rendering to focused sub-components:
 * - PickerProfileView (picker stats, details, edit)
 * - TeamLeaderProfileView (team overview, compliance)
 * - RunnerProfileView (activity, details)
 * - QuickMessageView (message composer + templates)
 * - ActivityHistoryView (role-aware history)
 */
import React, { useState } from 'react';
import { Picker } from '../../types';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { useTranslation } from '@/i18n';

// Sub-components
import PickerProfileView from './picker-details/PickerProfileView';
import TeamLeaderProfileView from './picker-details/TeamLeaderProfileView';
import RunnerProfileView from './picker-details/RunnerProfileView';
import QuickMessageView from './picker-details/QuickMessageView';
import ActivityHistoryView from './picker-details/ActivityHistoryView';
import {
    isPicker, isTeamLeader, isRunner,
    roleLabel, roleGradient, roleIcon, roleAccent,
    getStatusConfig,
    type SubView,
} from './picker-details/roleUtils';

interface PickerDetailsModalProps {
    picker: Picker;
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<Picker>) => void;
    onDelete?: (id: string) => void;
    showDeleteButton?: boolean;
    variant?: 'light' | 'dark';
    minWage?: number;
    pieceRate?: number;
    allCrew?: Picker[];
    onSendMessage?: (recipientId: string, message: string) => void;
    onAssignRow?: (rowNumber: number, side: 'north' | 'south', pickerIds: string[]) => Promise<void>;
}

const PickerDetailsModal: React.FC<PickerDetailsModalProps> = ({
    picker,
    onClose,
    onUpdate,
    onDelete,
    showDeleteButton = false,
    variant: _variant = 'dark',
    minWage = 23.95,
    pieceRate = 6.50,
    allCrew = [],
    onSendMessage,
    onAssignRow,
}) => {
    const { t } = useTranslation();
    const [subView, setSubView] = useState<SubView>('profile');
    const [isDeleting, setIsDeleting] = useState(false);

    const role = picker.role || 'picker';
    const accent = roleAccent(role);
    const statusConfig = getStatusConfig(picker.status, t);

    const handleDelete = async () => {
        if (!onDelete) return;
        if (!confirm(t('tl.team.confirm_remove', { name: picker.name }))) return;
        setIsDeleting(true);
        try {
            await onDelete(picker.id);
            onClose();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="max-h-[85vh] overflow-y-auto">
                {/* ── Header ─────────────────────────────────── */}
                <div className={`bg-gradient-to-br ${roleGradient(role)} px-6 pt-6 pb-10 relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-12 -mt-12"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8"></div>

                    <button aria-label={t('common.close')} onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-20">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>

                    <div className="relative z-10 flex items-center gap-4">
                        <div className="size-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold text-2xl text-white border border-white/20 shadow-lg">
                            {picker.avatar || <span aria-hidden="true" className="material-symbols-outlined text-3xl">{roleIcon(role)}</span>}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight">{picker.name}</h3>
                            <p className="text-white/70 text-sm font-medium">
                                {roleLabel(role, t)} • {picker.picker_id}
                            </p>
                        </div>
                    </div>

                    <div className={`relative z-10 inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                        <span className={`w-2 h-2 rounded-full ${statusConfig.dot} ${picker.status === 'active' ? 'animate-pulse' : ''}`}></span>
                        {statusConfig.label}
                    </div>
                </div>

                {/* ── Content ────────────────────────────────── */}
                <div className="px-6 pb-6 -mt-5 space-y-4">

                    {/* Sub-view: Message */}
                    {subView === 'message' && (
                        <QuickMessageView
                            pickerName={picker.name}
                            pickerId={picker.id}
                            accent={accent}
                            onSendMessage={onSendMessage}
                            onBack={() => setSubView('profile')}
                        />
                    )}

                    {/* Sub-view: History */}
                    {subView === 'history' && (
                        <ActivityHistoryView
                            picker={picker}
                            role={role}
                            pieceRate={pieceRate}
                            allCrew={allCrew}
                            onBack={() => setSubView('profile')}
                        />
                    )}

                    {/* Sub-view: Profile (role-specific) */}
                    {subView === 'profile' && (
                        <>
                            {isPicker(role) && (
                                <PickerProfileView picker={picker} minWage={minWage} pieceRate={pieceRate} allCrew={allCrew} onUpdate={onUpdate} />
                            )}
                            {isTeamLeader(role) && (
                                <TeamLeaderProfileView picker={picker} minWage={minWage} pieceRate={pieceRate} allCrew={allCrew} onUpdate={onUpdate} onAssignRow={onAssignRow} />
                            )}
                            {isRunner(role) && (
                                <RunnerProfileView picker={picker} onUpdate={onUpdate} />
                            )}

                            {/* Quick Actions */}
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSubView('message')} className={`flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm transition-colors ${accent.light}`}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">chat</span>
                                        {t('pd.message')}
                                    </button>
                                    <button onClick={() => setSubView('history')} className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl py-3 font-bold text-sm transition-colors">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">history</span>
                                        {t('panel.tabs.history')}
                                    </button>
                                </div>
                                {showDeleteButton && onDelete && (
                                    <button onClick={handleDelete} disabled={isDeleting}
                                        className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">person_remove</span>
                                        {isDeleting ? t('pd.removing') : t('pd.remove_role', { role: roleLabel(role, t) })}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ModalOverlay>
    );
};

export default PickerDetailsModal;
