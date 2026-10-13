/**
 * TeamLeaderProfileView — TL-specific profile: team overview, member list, compliance, details/edit
 * Enhanced: inline row assignment + multi-row display from rowAssignments
 */
import React, { useState, useMemo } from 'react';
import { Picker, PickerStatus } from '../../../types';
import { isPicker } from './roleUtils';
import { useHarvestStore } from '@/stores/useHarvestStore';

interface TeamLeaderProfileViewProps {
    picker: Picker;
    minWage: number;
    pieceRate: number;
    allCrew: Picker[];
    onUpdate: (id: string, updates: Partial<Picker>) => void;
    onAssignRow?: (rowNumber: number, side: 'north' | 'south', pickerIds: string[]) => Promise<void>;
}

const TeamLeaderProfileView: React.FC<TeamLeaderProfileViewProps> = React.memo(({
    picker,
    minWage,
    pieceRate,
    allCrew,
    onUpdate,
    onAssignRow,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [status, setStatus] = useState<PickerStatus>(picker.status);
    const [showRowAssigner, setShowRowAssigner] = useState(false);
    const [rowInput, setRowInput] = useState('');
    const [sideInput, setSideInput] = useState<'north' | 'south'>('north');
    const [assigning, setAssigning] = useState(false);

    // Get all rows this leader is assigned to from the store
    const rowAssignments = useHarvestStore(s => s.rowAssignments);
    const assignedRows = useMemo(() => {
        return rowAssignments
            .filter(ra => ra.assigned_pickers.includes(picker.id))
            .map(ra => ra.row_number);
    }, [rowAssignments, picker.id]);

    // Deduplicate rows (same row might have been assigned multiple times)
    const uniqueRows = useMemo(() => [...new Set(assignedRows)].sort((a, b) => a - b), [assignedRows]);

    // Horas efectivas — picker.hours es flag de wage-check (puede ser 0), estimar de check_in
    const effectiveHours = picker.hours > 0
        ? picker.hours
        : picker.check_in
          ? Math.max(0, (Date.now() - new Date(picker.check_in).getTime()) / 3600000)
          : 0;

    const tlStats = useMemo(() => {
        const myPickers = allCrew.filter(p => p.team_leader_id === picker.id && isPicker(p.role || 'picker'));
        const activePickers = myPickers.filter(p => p.status === 'active');
        const totalBuckets = myPickers.reduce((s, p) => s + (p.total_buckets_today || 0), 0);
        const avgBuckets = myPickers.length > 0 ? Math.round(totalBuckets / myPickers.length) : 0;
        const belowMinPickers = myPickers.filter(p => {
            const pRate = p.hours && p.hours > 0 ? (p.total_buckets_today * pieceRate) / p.hours : 0;
            return pRate < minWage && pRate > 0;
        });
        return { teamSize: myPickers.length, activePickers: activePickers.length, totalBuckets, avgBuckets, belowMin: belowMinPickers.length, belowMinNames: belowMinPickers.map(p => p.name) };
    }, [allCrew, picker.id, pieceRate, minWage]);

    const handleSave = () => {
        onUpdate(picker.id, { status });
        setIsEditing(false);
    };

    const handleAssignRow = async () => {
        if (!onAssignRow || !rowInput) return;
        setAssigning(true);
        const teamMembers = allCrew.filter(p => p.team_leader_id === picker.id || p.id === picker.id);
        const memberIds = teamMembers.map(p => p.id);
        await onAssignRow(parseInt(rowInput), sideInput, memberIds);
        setAssigning(false);
        setShowRowAssigner(false);
        setRowInput('');
    };

    return (
        <>
            {/* Team Overview */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Team Overview</p>
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-emerald-700">{tlStats.teamSize}</p>
                        <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Pickers</p>
                        <p className="text-[10px] text-emerald-500 mt-1">{tlStats.activePickers} active</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-slate-900">{tlStats.totalBuckets}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Team Buckets</p>
                        <p className="text-[10px] text-slate-400 mt-1">today</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-slate-900">{tlStats.avgBuckets}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Avg/Picker</p>
                        <p className="text-[10px] text-slate-400 mt-1">buckets</p>
                    </div>
                </div>
                {tlStats.belowMin > 0 && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="flex items-start gap-2">
                            <span aria-hidden="true" className="material-symbols-outlined text-amber-600 text-[20px] shrink-0 mt-0.5">warning</span>
                            <div>
                                <p className="text-sm text-amber-700 font-medium">{tlStats.belowMin} picker{tlStats.belowMin > 1 ? 's' : ''} below minimum wage</p>
                                <p className="text-xs text-amber-600 mt-0.5">{tlStats.belowMinNames.join(', ')}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Details Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Details</p>
                    {!isEditing && <button onClick={() => setIsEditing(true)} className="text-emerald-600 text-xs font-bold hover:text-emerald-800 transition-colors flex items-center gap-1"><span aria-hidden="true" className="material-symbols-outlined text-[14px]">edit</span>Edit</button>}
                </div>
                {isEditing ? (
                    <div className="space-y-3">
                        <div>
                            <label className="text-slate-500 text-xs block mb-1">Status</label>
                            <select value={status} onChange={(e) => setStatus(e.target.value as PickerStatus)} aria-label="Status"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 bg-white transition-all">
                                <option value="active">Active</option>
                                <option value="on_break">On Break</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSave} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors">Save</button>
                            <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-3">
                        {/* Current Rows — shows all assigned rows */}
                        <div
                            className={`rounded-xl p-3 transition-all ${uniqueRows.length > 0
                                ? 'bg-emerald-50 border border-emerald-200'
                                : 'bg-slate-50 border border-transparent'
                                } ${onAssignRow ? 'cursor-pointer hover:shadow-sm' : ''}`}
                            onClick={() => onAssignRow && setShowRowAssigner(true)}
                        >
                            <p className="text-[11px] text-slate-400 font-medium mb-0.5">Assigned Rows</p>
                            {uniqueRows.length > 0 ? (
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-emerald-700">
                                        {`R${uniqueRows.join(', R')}`}
                                    </p>
                                    {onAssignRow && (
                                        <span aria-hidden="true" className="material-symbols-outlined text-emerald-400 text-[14px]">add</span>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1">
                                    {onAssignRow ? (
                                        <>
                                            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[14px]">add_circle</span>
                                            <p className="text-sm font-bold text-primary">Assign rows</p>
                                        </>
                                    ) : (
                                        <p className="text-sm font-bold text-slate-500">None</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Hours On-Site</p><p className="text-sm font-bold text-slate-900">{effectiveHours > 0 ? effectiveHours.toFixed(1) : '0'}h</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Team Earnings</p><p className="text-sm font-bold text-emerald-600">${(tlStats.totalBuckets * pieceRate).toFixed(0)}</p></div>
                    </div>
                )}

                {/* Inline Row Assigner */}
                {showRowAssigner && onAssignRow && (
                    <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-primary uppercase">Add Row</p>
                            <button aria-label="Close row assignment" onClick={() => setShowRowAssigner(false)} className="text-slate-400 hover:text-slate-600">
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Row #</label>
                                <input
                                    type="number"
                                    value={rowInput}
                                    onChange={(e) => setRowInput(e.target.value)}
                                    placeholder="12"
                                    min={1}
                                    max={50}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-primary outline-none text-xl font-black text-center text-text-main bg-white"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Side</label>
                                <div className="flex bg-slate-100 p-0.5 rounded-xl h-[42px]">
                                    <button
                                        onClick={() => setSideInput('north')}
                                        className={`flex-1 rounded-lg text-[10px] font-bold transition-all ${sideInput === 'north' ? 'bg-white shadow text-primary' : 'text-slate-400'}`}
                                    >N</button>
                                    <button
                                        onClick={() => setSideInput('south')}
                                        className={`flex-1 rounded-lg text-[10px] font-bold transition-all ${sideInput === 'south' ? 'bg-white shadow text-primary' : 'text-slate-400'}`}
                                    >S</button>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleAssignRow}
                            disabled={!rowInput || assigning}
                            className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-xs hover:bg-red-600 disabled:opacity-50 transition-all active:scale-[0.98]"
                        >
                            {assigning ? 'Assigning...' : `Assign Row ${rowInput || ''}`}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
});

TeamLeaderProfileView.displayName = 'TeamLeaderProfileView';
export default TeamLeaderProfileView;
