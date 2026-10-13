import React, { useState, useEffect, useMemo, useRef } from 'react';
import { databaseService } from '../../services/database.service';
import { userService } from '../../services/user.service';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';
import {
    batchAssignToast,
    countRole,
    emptyStaffMessage,
    filterStaff,
    mergeStaff,
    selectableIds,
    toggleId,
    type StaffFilter,
    type StaffInfo,
} from './staff-selection/staffSelectionLogic';
import { StaffRow } from './staff-selection/StaffRow';


interface TeamLeaderSelectionModalProps {
    isOpen?: boolean;
    onClose: () => void;
    orchardId?: string;
    onAdd: (userId: string) => void;
    onRemoveUser?: (userId: string) => Promise<void>;
    selectedLeaderIds?: string[];
    onSave?: (ids: string[]) => void;
    onViewDetails?: (leader: StaffInfo) => void;
}

const TeamLeaderSelectionModal: React.FC<TeamLeaderSelectionModalProps> = ({
    onClose,
    orchardId,
    onAdd,
    onRemoveUser
}) => {
    const [staff, setStaff] = useState<StaffInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [filter, setFilter] = useState<StaffFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
    const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
    const { showToast } = useToast();
    const searchRef = useRef<HTMLInputElement>(null);

    // Focus search input after mount (delayed to override ModalOverlay's dialog focus)
    useEffect(() => {
        const timer = setTimeout(() => {
            searchRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchStaff = async () => {
            setLoading(true);
            try {
                const [leaders, runners] = await Promise.all([
                    databaseService.getAvailableTeamLeaders(),
                    databaseService.getAvailableRunners(),
                ]);

                const allStaff = mergeStaff(leaders, runners);
                setStaff(allStaff);
            } catch (error) {
                logger.error("Error loading staff:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStaff();
    }, []);

    // Filter by role, then by search query
    const filteredStaff = useMemo(
        () => filterStaff(staff, filter, searchQuery),
        [staff, filter, searchQuery]
    );

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => toggleId(prev, id));
    };

    const selectAll = () => {
        setSelectedIds(selectableIds(filteredStaff, orchardId));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBatchAssign = async () => {
        if (!orchardId || selectedIds.size === 0) return;
        setAssigning(true);
        let successCount = 0;
        let failCount = 0;

        for (const userId of selectedIds) {
            try {
                await databaseService.assignUserToOrchard(userId, orchardId);
                successCount++;
            } catch (error) {
                logger.error(`Error assigning staff ${userId}:`, error);
                failCount++;
            }
        }

        const toast = batchAssignToast(successCount, failCount);
        showToast(toast.message, toast.type);

        setAssigning(false);
        onAdd(''); // trigger refresh
        onClose();
    };

    const handleUnlink = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();

        // First click: show confirm
        if (confirmUnlinkId !== userId) {
            setConfirmUnlinkId(userId);
            // Auto-reset after 3 seconds
            setTimeout(() => setConfirmUnlinkId(prev => prev === userId ? null : prev), 3000);
            return;
        }

        // Second click: execute unlink
        setConfirmUnlinkId(null);
        setUnlinkingId(userId);
        try {
            if (onRemoveUser) {
                await onRemoveUser(userId);
            } else {
                await userService.unassignUserFromOrchard(userId);
            }
            // Update local state to reflect the change
            setStaff(prev => prev.map(s =>
                s.id === userId ? { ...s, orchard_id: undefined } : s
            ));
            showToast('Staff member unlinked.', 'success');
        } catch (err) {
            logger.error('Failed to unlink from modal:', err);
            showToast('Failed to unlink staff member.', 'error');
        } finally {
            setUnlinkingId(null);
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-light">
                    <div>
                        <h3 className="text-xl font-black text-text-main">Link Staff to Orchard</h3>
                        <p className="text-xs text-text-muted mt-1">
                            Select staff to assign — you can link multiple at once
                        </p>
                    </div>
                    <button aria-label="Close" onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-3 border-b border-border-light">
                    <div className="relative">
                        <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                        <input
                            ref={searchRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="Search by name..."
                            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border-light bg-white text-sm text-text-main placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        />
                        {searchQuery && (
                            <button aria-label="Clear search"
                                onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-text-main transition-colors"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Tabs + Select All/None */}
                <div className="px-6 py-3 flex items-center justify-between border-b border-border-light bg-slate-50/50">
                    <div className="flex gap-2">
                        {([
                            { key: 'all' as const, label: 'All', icon: 'people' },
                            { key: 'team_leader' as const, label: 'Leaders', icon: 'groups' },
                            { key: 'runner' as const, label: 'Runners', icon: 'local_shipping' },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all duration-200 ${filter === tab.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-slate-500 border border-border-light hover:bg-slate-100'
                                    }`}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={selectAll}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                            Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                            onClick={clearSelection}
                            className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                {/* Staff List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-text-muted">Loading staff roster...</p>
                        </div>
                    ) : filteredStaff.length === 0 ? (
                        <div className="text-center py-8 text-text-muted">
                            <span aria-hidden="true" className="material-symbols-outlined text-3xl mb-2 opacity-30">
                                {searchQuery ? 'search_off' : 'person_off'}
                            </span>
                            <p className="text-sm font-medium">
                                {emptyStaffMessage(searchQuery, filter)}
                            </p>
                        </div>
                    ) : (
                        filteredStaff.map(person => (
                            <StaffRow
                                key={person.id}
                                person={person}
                                alreadyHere={person.orchard_id === orchardId}
                                isSelected={selectedIds.has(person.id)}
                                isUnlinking={unlinkingId === person.id}
                                isConfirming={confirmUnlinkId === person.id}
                                onToggle={toggleSelection}
                                onUnlink={handleUnlink}
                            />
                        ))
                    )}
                </div>

                {/* Footer with count + Link button */}
                <div className="px-6 py-4 border-t border-border-light bg-slate-50/50 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">
                        {filteredStaff.length} staff • {countRole(staff, 'team_leader')} leaders • {countRole(staff, 'runner')} runners
                    </span>
                    <div className="flex items-center gap-3">
                        {selectedIds.size > 0 && (
                            <span className="text-xs font-bold text-indigo-600">
                                {selectedIds.size} selected
                            </span>
                        )}
                        <button
                            onClick={handleBatchAssign}
                            disabled={selectedIds.size === 0 || assigning}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 ${selectedIds.size === 0
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : assigning
                                    ? 'bg-indigo-400 text-white cursor-wait'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
                                }`}
                        >
                            {assigning ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Linking...
                                </>
                            ) : (
                                <>
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm">link</span>
                                    Link {selectedIds.size > 0 ? `(${selectedIds.size})` : 'Selected'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default TeamLeaderSelectionModal;
