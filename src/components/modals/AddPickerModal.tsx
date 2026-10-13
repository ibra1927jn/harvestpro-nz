/**
 * AddPickerModal - Modal para añadir un nuevo picker
 * Versión centralizada para TeamLeader
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { DEFAULT_START_TIME } from '../../types';

export interface NewPickerData {
    name: string;
    avatar: string;
    role: 'picker';
    picker_id: string;
    harness_id: string;
    status: 'active';
    safety_verified: boolean;
    current_row?: number;
    qcStatus?: number[];
    team_leader_id?: string;
    orchard_id?: string;
    visited_rows?: unknown[];
}

interface AddPickerModalProps {
    isOpen?: boolean;
    onClose: () => void;
    onAdd: (picker: NewPickerData) => Promise<void> | void;
}

const AddPickerModal: React.FC<AddPickerModalProps> = ({ onClose, onAdd }) => {
    const { appUser } = useAuth();
    const { orchard, crew } = useHarvestStore();
    // RRHH/admin eligen el equipo; el team leader lo mete en el suyo
    const choosesTeam = appUser?.role === 'hr_admin' || appUser?.role === 'admin';
    const teamLeaders = (crew || []).filter(p => p.role === 'team_leader' && p.status !== 'archived');
    const [teamLeaderId, setTeamLeaderId] = useState('');
    const [name, setName] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [harnessNumber, setHarnessNumber] = useState('');
    const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
    const [assignedRow, setAssignedRow] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    // Safety Induction State (Simplified to boolean logic effectively)
    const [safetyChecks, setSafetyChecks] = useState({
        hazards: false,
        branches: false,
        tractorMovement: false
    });

    const allSafetyChecksPassed = safetyChecks.hazards && safetyChecks.branches && safetyChecks.tractorMovement;

    const handleAdd = async () => {
        if (!name || !idNumber || !harnessNumber || !startTime) return;

        setIsSubmitting(true);
        try {
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

            logger.debug('[AddPicker] IDs:', {
                teamLeaderId: appUser?.id,
                orchardId: orchard?.id
            });

            const newPicker: NewPickerData = {
                name: name,
                avatar,
                role: 'picker', // en minúsculas: la BD solo acepta picker|runner|bucket_runner|team_leader
                picker_id: idNumber,
                harness_id: harnessNumber,
                // Si lo añade un team leader, va a su equipo; si es el manager, queda sin asignar
                team_leader_id: appUser?.role === 'team_leader'
                    ? appUser.id
                    : (choosesTeam && teamLeaderId ? teamLeaderId : undefined),
                orchard_id: orchard?.id || undefined, // Allow undefined if not in orchard
                status: 'active',
                safety_verified: true,
                current_row: 0,
                visited_rows: []
            };
            logger.debug('[AddPicker] Submitting:', newPicker);
            await onAdd(newPicker);
            onClose();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error adding picker:', error);
            showToast(`Failed to add: ${errorMessage}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-text-main">Add New Picker</h3>
                    <button aria-label="Close" onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Full Name *</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Liam O'Connor"
                            className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-text-main bg-white transition-colors" />
                    </div>
                    {choosesTeam && (
                        <div>
                            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Team (team leader)</label>
                            <select value={teamLeaderId} onChange={(e) => setTeamLeaderId(e.target.value)} aria-label="Team leader"
                                className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-text-main bg-white">
                                <option value="">No team yet</option>
                                {teamLeaders.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Picker ID *</label>
                            <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)}
                                placeholder="e.g. 402"
                                className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none font-mono text-text-main bg-white transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-primary uppercase mb-2 block">Harness No. *</label>
                            <input type="text" value={harnessNumber} onChange={(e) => setHarnessNumber(e.target.value.toUpperCase())}
                                placeholder="HN-402"
                                className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none font-mono uppercase text-text-main bg-white transition-colors" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Start Time *</label>
                            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} title="Start Time"
                                className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-text-main bg-white transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Row (Optional)</label>
                            <input type="number" value={assignedRow} onChange={(e) => setAssignedRow(e.target.value)}
                                placeholder="e.g. 12"
                                className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-text-main bg-white transition-colors" />
                        </div>
                    </div>

                    {/* SAFETY INDUCTION (Simplified) */}
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                <span aria-hidden="true" className="material-symbols-outlined">health_and_safety</span>
                            </div>
                            <div>
                                <h3 className="font-black text-text-main text-sm">Safety Induction</h3>
                                <p className="text-xs font-medium text-text-muted">Cooper Lane Protocols</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-3 p-4 bg-white rounded-xl border border-orange-200 cursor-pointer hover:border-orange-400 transition-all select-none group">
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${allSafetyChecksPassed ? 'bg-warning border-warning' : 'border-slate-300 group-hover:border-orange-300'}`}>
                                {allSafetyChecksPassed && <span aria-hidden="true" className="material-symbols-outlined text-white text-sm font-bold">check</span>}
                            </div>
                            <input
                                type="checkbox"
                                checked={allSafetyChecksPassed}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSafetyChecks({ hazards: checked, branches: checked, tractorMovement: checked });
                                }}
                                className="hidden"
                            />
                            <span className="font-bold text-text-sub text-sm">Safety Induction Completed (Inducción Completada)</span>
                        </label>
                    </div>
                    <button onClick={handleAdd}
                        disabled={!name || !idNumber || !harnessNumber || !startTime || isSubmitting || !allSafetyChecksPassed}
                        className="w-full mt-6 py-4 gradient-primary glow-primary text-white rounded-xl font-bold uppercase tracking-widest disabled:bg-surface-tertiary disabled:shadow-none disabled:cursor-not-allowed active:scale-95 transition-all">
                        {isSubmitting ? 'Adding...' : 'Add Picker to Team'}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default AddPickerModal;