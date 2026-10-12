/**
 * RowAssignmentModal — Assign teams to rows (orchestrator)
 *
 * Sub-components: RowTeamDisplay, RowGrid
 */
import React, { useState, useMemo } from 'react';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import { Picker } from '@/types';
import RowTeamDisplay from './RowTeamDisplay';
import RowGrid from './RowGrid';
import { useTranslation } from '@/i18n';

interface RowAssignmentModalProps {
    onClose: () => void;
    initialRow?: number;
    onViewPicker?: (picker: Picker) => void;
}

interface TeamOnRow {
    leader: Picker | null;
    members: Picker[];
    total: number;
}

const RowAssignmentModal: React.FC<RowAssignmentModalProps> = ({ onClose, initialRow = 1, onViewPicker }) => {
    const { assignRows, crew, orchard, rowAssignments } = useHarvest();
    const orchardBlocks = useHarvest(s => s.orchardBlocks);
    const selectedBlockId = useHarvest(s => s.selectedBlockId);
    const selectedVariety = useHarvest(s => s.selectedVariety);
    const [selectedRows, setSelectedRows] = useState<number[]>([initialRow]);
    const [selectedLeader, setSelectedLeader] = useState<string>('');
    const [selectedRunner, setSelectedRunner] = useState<string>('');
    const [selectedSide, setSelectedSide] = useState<'north' | 'south'>('north');
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    const { t } = useTranslation();
    const teamLeaders = crew.filter(p => p.role === 'team_leader');
    const runners = crew.filter(p => p.role === 'runner' || p.role === 'bucket_runner');

    // Block-specific rows
    const selectedBlock = orchardBlocks.find(b => b.id === selectedBlockId) || null;
    const blockRows = useMemo(() => {
        if (selectedBlock) {
            return Array.from(
                { length: selectedBlock.totalRows },
                (_, i) => selectedBlock.startRow + i
            );
        }
        return Array.from({ length: 20 }, (_, i) => i + 1);
    }, [selectedBlock]);

    // Build teams per row from rowAssignments
    const teamsPerRow = useMemo(() => {
        const map: Record<number, TeamOnRow[]> = {};
        rowAssignments.forEach(ra => {
            if (!map[ra.row_number]) map[ra.row_number] = [];
            const team: TeamOnRow = { leader: null, members: [], total: 0 };
            ra.assigned_pickers.forEach(pid => {
                const p = crew.find(c => c.id === pid);
                if (!p) return;
                if (p.role === 'team_leader' && !team.leader) {
                    team.leader = p;
                } else {
                    team.members.push(p);
                }
            });
            team.total = (team.leader ? 1 : 0) + team.members.length;
            if (team.total > 0) map[ra.row_number].push(team);
        });
        return map;
    }, [rowAssignments, crew]);

    const teamsOnRow = teamsPerRow[initialRow] || [];
    const totalPeopleOnRow = teamsOnRow.reduce((s, t) => s + t.total, 0);
    const occupiedCount = blockRows.filter(r => (teamsPerRow[r] || []).length > 0).length;

    const getLeaderRows = (leaderId: string): number[] => {
        const rows = rowAssignments
            .filter(ra => ra.assigned_pickers.includes(leaderId))
            .map(ra => ra.row_number);
        return [...new Set(rows)].sort((a, b) => a - b);
    };

    const toggleRow = (row: number) => {
        setSelectedRows(prev =>
            prev.includes(row) ? prev.filter(r => r !== row) : [...prev, row]
        );
    };

    const handleAssign = async () => {
        if (!assignRows || !selectedLeader || selectedRows.length === 0) return;
        setAssigning(true);
        setAssignError(null);
        const teamMembers = crew.filter(p => p.team_leader_id === selectedLeader || p.id === selectedLeader);
        const memberIds = teamMembers.map(p => p.id);
        // Incluir el runner seleccionado si no está ya en la lista
        if (selectedRunner && !memberIds.includes(selectedRunner)) {
            memberIds.push(selectedRunner);
        }
        try {
            await assignRows(selectedRows, selectedSide, memberIds);
            onClose();
        } catch (e) {
            setAssignError(e instanceof Error ? e.message : 'Row assignment not saved');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black text-text-main">{t('assignModal.title').replace('{row}', String(initialRow))}</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {selectedBlock?.name || orchard?.name || 'Orchard'}
                                {' · '}{t('assignModal.subtitle').replace('{occupiedCount}', String(occupiedCount)).replace('{totalRows}', String(blockRows.length))}
                            </p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                            <span className="material-symbols-outlined text-slate-500 text-lg">close</span>
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
                    {/* Teams on this row */}
                    <RowTeamDisplay
                        teamsOnRow={teamsOnRow}
                        totalPeople={totalPeopleOnRow}
                        rowNumber={initialRow}
                        onViewPicker={onViewPicker}
                    />

                    {/* Row selection grid */}
                    <RowGrid
                        blockRows={blockRows}
                        selectedRows={selectedRows}
                        teamsPerRow={teamsPerRow}
                        selectedVariety={selectedVariety}
                        selectedBlock={selectedBlock}
                        blockName={selectedBlock?.name || 'Block'}
                        onToggleRow={toggleRow}
                        blockRowsLabel={t('assignModal.block_rows').replace('{blockName}', selectedBlock?.name || 'Block')}
                        selectedLabel={selectedRows.length === 1
                            ? t('assignModal.selected_one').replace('{n}', '1')
                            : t('assignModal.selected_other').replace('{n}', String(selectedRows.length))
                        }
                    />

                    {/* Team Leader */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">{t('assignModal.team_leader')}</label>
                        <select
                            value={selectedLeader}
                            onChange={(e) => setSelectedLeader(e.target.value)}
                            aria-label="Assign team leader to row"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none text-text-main focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                        >
                            <option value="">{t('assignModal.select_leader')}</option>
                            {teamLeaders.map(tl => {
                                const tlRows = getLeaderRows(tl.id);
                                const rowLabel = tlRows.length > 0 ? ` (R${tlRows.join(', R')})` : '';
                                const memberCount = crew.filter(p => p.team_leader_id === tl.id).length;
                                return (
                                    <option key={tl.id} value={tl.id}>{tl.name} · {memberCount}p{rowLabel}</option>
                                );
                            })}
                        </select>

                        {/* Mini team preview */}
                        {selectedLeader && (() => {
                            const members = crew.filter(p => p.team_leader_id === selectedLeader);
                            if (members.length === 0) return null;
                            return (
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {members.slice(0, 6).map(m => {
                                        const isRunnerMember = m.role === 'runner' || m.role === 'bucket_runner';
                                        return (
                                            <div key={m.id} className="flex items-center gap-1">
                                                <div className={`w-5 h-5 rounded-full ${isRunnerMember ? 'bg-blue-500' : 'bg-indigo-500'} flex items-center justify-center text-white text-[7px] font-bold`}>
                                                    {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <span className={`text-[10px] font-bold ${isRunnerMember ? 'text-blue-600' : 'text-indigo-600'}`}>{m.name.split(' ')[0]}</span>
                                            </div>
                                        );
                                    })}
                                    {members.length > 6 && <span className="text-[10px] text-slate-400">+{members.length - 6}</span>}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Bucket Runner */}
                    {runners.length > 0 && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">{t('assignModal.bucket_runner')}</label>
                            <select
                                value={selectedRunner}
                                onChange={(e) => setSelectedRunner(e.target.value)}
                                aria-label="Assign bucket runner to row"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none text-text-main focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                            >
                                <option value="">{t('assignModal.select_runner')}</option>
                                {runners.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Side Toggle */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">{t('assignModal.side')}</label>
                        <div className="flex bg-slate-100 p-0.5 rounded-xl">
                            {(['north', 'south'] as const).map(side => (
                                <button
                                    key={side}
                                    onClick={() => setSelectedSide(side)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectedSide === side ? 'bg-white shadow-sm text-primary' : 'text-slate-400'}`}
                                >
                                    {side === 'north' ? t('assignModal.side.north') : t('assignModal.side.south')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Confirm */}
                <div className="px-5 pb-5 pt-2">
                    {assignError && (
                        <p role="alert" className="mb-2 text-sm font-medium text-red-600">{assignError}</p>
                    )}
                    <button
                        onClick={handleAssign}
                        disabled={!selectedLeader || selectedRows.length === 0 || assigning}
                        className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98] hover:shadow-md"
                    >
                        {assigning ? t('assignModal.assigning')
                            : selectedRows.length > 1 ? t('assignModal.confirm_n_rows').replace('{n}', String(selectedRows.length))
                                : t('assignModal.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RowAssignmentModal;
