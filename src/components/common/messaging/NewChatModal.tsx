/**
 * NewChatModal — Create new DM or group conversation
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { getAvatarColor, getRoleBadge } from './messagingHelpers';

interface Props {
    availableUsers: Array<{ id: string; name: string; role: string }>;
    currentUserId: string;
    onClose: () => void;
    onStartDirect: (userId: string) => void;
    onCreateGroup: (name: string, ids: string[]) => void;
}

const NewChatModal: React.FC<Props> = ({
    availableUsers, currentUserId, onClose, onStartDirect, onCreateGroup,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose });

    const [mode, setMode] = useState<'direct' | 'group'>('direct');
    const [groupName, setGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleCreateGroup = () => {
        if (!groupName.trim() || selectedIds.length === 0) return;
        onCreateGroup(groupName, selectedIds);
    };

    const filteredUsers = availableUsers.filter(u =>
        u.id !== currentUserId && u.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="New chat" className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="p-5 border-b border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-sm">
                                <span aria-hidden="true" className="material-symbols-outlined text-white text-lg">
                                    {mode === 'direct' ? 'person_add' : 'group_add'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-800">
                                    {mode === 'direct' ? 'New Message' : 'Create Group'}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    {mode === 'direct' ? 'Select a person to message' : `${selectedIds.length} selected`}
                                </p>
                            </div>
                        </div>
                        <button aria-label="Close" onClick={onClose} className="size-9 flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-xl transition">
                            <span aria-hidden="true" className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    {/* Mode Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setMode('direct')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${mode === 'direct' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">person</span>Direct
                        </button>
                        <button onClick={() => setMode('group')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${mode === 'group' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">groups</span>Group
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {mode === 'group' && (
                        <div className="mb-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1">Group Name</label>
                            <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Block A Team"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
                        </div>
                    )}
                    <div className="relative mb-3">
                        <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-lg">search</span>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:border-indigo-300 transition font-medium placeholder:text-slate-300" />
                    </div>
                    <div className="space-y-1.5">
                        {filteredUsers.map(p => {
                            const isSelected = selectedIds.includes(p.id);
                            const badge = getRoleBadge(p.role);
                            return (
                                <button key={p.id} onClick={() => { if (mode === 'direct') onStartDirect(p.id); else toggleSelection(p.id); }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left active:scale-[0.98] ${mode === 'group' && isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100'}`}>
                                    <div className={`size-10 rounded-full bg-gradient-to-br ${getAvatarColor(p.name)} flex items-center justify-center font-bold text-white text-sm shadow-sm transition ${mode === 'group' && isSelected ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}>
                                        {mode === 'group' && isSelected ? <span aria-hidden="true" className="material-symbols-outlined text-base">check</span> : p.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${mode === 'group' && isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{p.name}</p>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.bg}`}>
                                            <span aria-hidden="true" className="material-symbols-outlined text-[11px]">{badge.icon}</span>
                                            {p.role?.replace('_', ' ') || 'Picker'}
                                        </span>
                                    </div>
                                    {mode === 'direct' && <span aria-hidden="true" className="material-symbols-outlined text-slate-300 text-lg">arrow_forward_ios</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Create Group Footer */}
                {mode === 'group' && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <button onClick={handleCreateGroup} disabled={!groupName.trim() || selectedIds.length === 0}
                            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:shadow-none transition active:scale-[0.98]">
                            Create Group ({selectedIds.length} members)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NewChatModal;
