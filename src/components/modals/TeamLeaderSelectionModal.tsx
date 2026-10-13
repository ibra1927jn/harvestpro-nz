import React, { useState, useEffect, useMemo, useRef } from 'react';
import { databaseService } from '../../services/database.service';
import { userService } from '../../services/user.service';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';

interface StaffInfo {
    id: string;
    full_name: string;
    role: string;
    orchard_id?: string;
}

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
    const [filter, setFilter] = useState<'all' | 'team_leader' | 'runner'>('all');
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

                const allStaff: StaffInfo[] = [
                    ...(leaders || []).map((l: { id: string; full_name: string; orchard_id?: string }) => ({
                        ...l,
                        role: 'team_leader',
                    })),
                    ...(runners || []).map((r: { id: string; full_name: string; orchard_id?: string }) => ({
                        ...r,
                        role: 'runner',
                    })),
                ];
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
    const filteredStaff = useMemo(() => {
        let result = filter === 'all' ? staff : staff.filter(s => s.role === filter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(s => s.full_name?.toLowerCase().includes(q));
        }
        return result;
    }, [staff, filter, searchQuery]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        const availableIds = filteredStaff
            .filter(s => s.orchard_id !== orchardId)
            .map(s => s.id);
        setSelectedIds(new Set(availableIds));
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

        if (failCount > 0) {
            showToast(`Linked ${successCount} staff. ${failCount} failed.`, 'warning');
        } else {
            showToast(`Successfully linked ${successCount} staff member${successCount > 1 ? 's' : ''}.`, 'success');
        }

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

    const roleLabel = (role: string) =>
        role === 'team_leader' ? 'Team Leader' : 'Bucket Runner';

    const roleColor = (role: string) =>
        role === 'team_leader'
            ? 'bg-indigo-100 text-indigo-700'
            : 'bg-blue-100 text-blue-700';

    const roleIcon = (role: string) =>
        role === 'team_leader' ? 'groups' : 'local_shipping';

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
                                {searchQuery
                                    ? `No results for "${searchQuery}"`
                                    : filter === 'all'
                                        ? 'No staff found in the system.'
                                        : `No ${filter === 'team_leader' ? 'Team Leaders' : 'Runners'} found.`}
                            </p>
                        </div>
                    ) : (
                        filteredStaff.map(person => {
                            const alreadyHere = person.orchard_id === orchardId;
                            const isSelected = selectedIds.has(person.id);
                            const isUnlinking = unlinkingId === person.id;
                            const isConfirming = confirmUnlinkId === person.id;

                            return (
                                <div
                                    key={person.id}
                                    onClick={() => !alreadyHere && !isUnlinking && toggleSelection(person.id)}
                                    className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-200 ${alreadyHere
                                        ? 'border-green-200 bg-green-50/30 cursor-default'
                                        : isSelected
                                            ? 'border-indigo-400 bg-indigo-50 shadow-sm cursor-pointer'
                                            : 'border-border-light cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-200 hover:shadow-sm'
                                        } group`}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Checkbox */}
                                        <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${alreadyHere
                                            ? 'border-green-400 bg-green-100'
                                            : isSelected
                                                ? 'border-indigo-600 bg-indigo-600'
                                                : 'border-slate-300 group-hover:border-indigo-400'
                                            }`}>
                                            {(isSelected || alreadyHere) && (
                                                <span aria-hidden="true" className={`material-symbols-outlined text-xs ${alreadyHere ? 'text-green-600' : 'text-white'}`}>check</span>
                                            )}
                                        </div>

                                        <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                                            {person.full_name?.substring(0, 2).toUpperCase() || '??'}
                                        </div>
                                        <div>
                                            <p className="font-bold text-text-main">{person.full_name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleColor(person.role)}`}>
                                                    <span aria-hidden="true" className="material-symbols-outlined text-[10px] mr-0.5 align-middle">{roleIcon(person.role)}</span>
                                                    {roleLabel(person.role)}
                                                </span>
                                                {alreadyHere && (
                                                    <span className="text-[10px] text-green-600 font-bold">✅ Linked</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right side: unlink button for linked, check for selected */}
                                    {alreadyHere ? (
                                        <button
                                            onClick={(e) => handleUnlink(e, person.id)}
                                            disabled={isUnlinking}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all duration-200 ${isUnlinking
                                                ? 'bg-slate-100 text-slate-400 cursor-wait'
                                                : isConfirming
                                                    ? 'bg-red-500 text-white shadow-sm hover:bg-red-600'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                                                }`}
                                        >
                                            {isUnlinking ? (
                                                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                            ) : isConfirming ? (
                                                <>
                                                    <span aria-hidden="true" className="material-symbols-outlined text-xs">warning</span>
                                                    Confirm?
                                                </>
                                            ) : (
                                                <>
                                                    <span aria-hidden="true" className="material-symbols-outlined text-sm">link_off</span>
                                                    Unlink
                                                </>
                                            )}
                                        </button>
                                    ) : isSelected ? (
                                        <span aria-hidden="true" className="material-symbols-outlined text-indigo-600">check_circle</span>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer with count + Link button */}
                <div className="px-6 py-4 border-t border-border-light bg-slate-50/50 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">
                        {filteredStaff.length} staff • {staff.filter(s => s.role === 'team_leader').length} leaders • {staff.filter(s => s.role === 'runner').length} runners
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
