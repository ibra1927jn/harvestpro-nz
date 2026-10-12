/**
 * PickerProfileView — Picker-specific profile: stats, effective rate, details/edit
 */
import React, { useState, useMemo } from 'react';
import { Picker, PickerStatus } from '../../../types';
import { ComparisonBadge, isPicker } from './roleUtils';
import { useAuth } from '@/context/AuthContext';

interface PickerProfileViewProps {
    picker: Picker;
    minWage: number;
    pieceRate: number;
    allCrew: Picker[];
    onUpdate: (id: string, updates: Partial<Picker>) => void;
}

const PickerProfileView: React.FC<PickerProfileViewProps> = React.memo(({
    picker,
    minWage,
    pieceRate,
    allCrew,
    onUpdate,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [assignedRow, setAssignedRow] = useState(picker.current_row?.toString() || '');
    const { appUser } = useAuth();
    const [status, setStatus] = useState<PickerStatus>(picker.status);

    // Cuando picker.hours === 0 el picker no activa wage-alert, pero puede tener check_in
    // para estimar las horas transcurridas desde el inicio del turno
    const effectiveHours = picker.hours > 0
        ? picker.hours
        : picker.check_in
          ? Math.max(0, (Date.now() - new Date(picker.check_in).getTime()) / 3600000)
          : 0;

    const earnings = picker.total_buckets_today * pieceRate;
    const hourlyRate = effectiveHours > 0 ? earnings / effectiveHours : 0;
    const isAboveMinimum = hourlyRate >= minWage;
    const speed = effectiveHours > 0
        ? Math.round(picker.total_buckets_today / effectiveHours) : 0;

    const teamStats = useMemo(() => {
        const activePickers = allCrew.filter(p => isPicker(p.role || 'picker') && p.status === 'active');
        if (activePickers.length === 0) return { avgBuckets: 0, avgSpeed: 0 };
        const totalBuckets = activePickers.reduce((s, p) => s + (p.total_buckets_today || 0), 0);
        const avgBuckets = Math.round(totalBuckets / activePickers.length);
        const pickersWithHours = activePickers.filter(p => p.hours && p.hours > 0);
        const avgSpeed = pickersWithHours.length > 0
            ? Math.round(pickersWithHours.reduce((s, p) => s + ((p.total_buckets_today || 0) / (p.hours || 1)), 0) / pickersWithHours.length)
            : 0;
        return { avgBuckets, avgSpeed };
    }, [allCrew]);

    const bucketDiff = picker.total_buckets_today - teamStats.avgBuckets;
    const speedDiff = speed - teamStats.avgSpeed;

    const handleSave = () => {
        onUpdate(picker.id, {
            current_row: assignedRow ? parseInt(assignedRow) : undefined,
            status,
        });
        setIsEditing(false);
    };

    return (
        <>
            {/* Performance Stats */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Today&apos;s Performance</p>
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-slate-900">{picker.total_buckets_today}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Buckets</p>
                        {teamStats.avgBuckets > 0 && (
                            <div className="mt-2 space-y-0.5">
                                <ComparisonBadge diff={bucketDiff} avgBaseline={teamStats.avgBuckets} />
                                <p className="text-[10px] text-slate-400">Avg: {teamStats.avgBuckets}</p>
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-slate-900">{speed}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">/hr Speed</p>
                        {teamStats.avgSpeed > 0 && (
                            <div className="mt-2 space-y-0.5">
                                <ComparisonBadge diff={speedDiff} suffix="/hr" avgBaseline={teamStats.avgSpeed} />
                                <p className="text-[10px] text-slate-400">Avg: {teamStats.avgSpeed}/hr</p>
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className={`text-2xl font-black ${earnings > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>${earnings.toFixed(0)}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Earnings</p>
                        {earnings > 0 && <div className="mt-2"><span className="text-[10px] text-slate-400">@ ${pieceRate}/bkt</span></div>}
                    </div>
                </div>

                {/* Effective Rate Bar */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-500">Effective Rate</span>
                        <span className={`text-lg font-bold ${isAboveMinimum ? 'text-emerald-600' : 'text-red-500'}`}>${hourlyRate.toFixed(2)}/hr</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden relative">
                        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-300 z-10 dynamic-left" style={{ '--x': `${Math.min(100, (minWage / (minWage * 1.5)) * 100)}%` } as React.CSSProperties}></div>
                        <div className={`h-full rounded-full transition-all duration-700 ${isAboveMinimum ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-300 to-red-400'} dynamic-width`}
                            style={{ '--w': `${Math.min(100, (hourlyRate / (minWage * 1.5)) * 100)}%` } as React.CSSProperties}></div>
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400">$0</span>
                        <span className={`text-[10px] font-medium ${isAboveMinimum ? 'text-slate-400' : 'text-red-500'}`}>Min ${minWage}/hr {!isAboveMinimum && '⬇ Below'}</span>
                    </div>
                </div>
            </div>

            {/* Details Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Details</p>
                    {!isEditing && <button onClick={() => setIsEditing(true)} className="text-indigo-600 text-xs font-bold hover:text-indigo-800 transition-colors flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>}
                </div>
                {isEditing ? (
                    <div className="space-y-3">
                        <div>
                            <label className="text-slate-500 text-xs block mb-1">Row Number</label>
                            <input type="number" value={assignedRow} onChange={(e) => setAssignedRow(e.target.value)} placeholder="e.g. 12"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-slate-900 bg-white transition-all" />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs block mb-1">Status</label>
                            <select value={status} onChange={(e) => setStatus(e.target.value as PickerStatus)} aria-label="Picker Status"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-slate-900 bg-white transition-all">
                                <option value="active">Active</option>
                                <option value="on_break">On Break</option>
                                {/* Dar de baja (Inactive) es cosa del team leader o RRHH */}
                                {(appUser?.role !== 'manager' || status === 'inactive') && (
                                    <option value="inactive">Inactive</option>
                                )}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSave} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors">Save</button>
                            <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Current Row</p><p className="text-sm font-bold text-slate-900">{picker.current_row ? `Row ${picker.current_row}` : 'Unassigned'}</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Harness</p><p className={`text-sm font-bold ${picker.harness_id ? 'text-slate-900' : 'text-amber-600'}`}>{picker.harness_id || 'Not assigned'}</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Team</p><p className="text-sm font-bold text-slate-900">{picker.team_leader_id ? 'Assigned' : 'No team'}</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400 font-medium mb-0.5">Hours Today</p><p className="text-sm font-bold text-slate-900">{effectiveHours > 0 ? effectiveHours.toFixed(1) : (picker.hours?.toFixed(1) || '0')}h</p></div>
                    </div>
                )}
            </div>
        </>
    );
});

PickerProfileView.displayName = 'PickerProfileView';
export default PickerProfileView;
