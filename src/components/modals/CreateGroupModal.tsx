/**
 * CreateGroupModal - Modal para crear grupos de chat
 * Reutilizable en Manager, TeamLeader y Runner
 */

import { logger } from '@/utils/logger';
import React, { useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';

export interface ChatGroup {
    id: string;
    name: string;
    members: string[];
    isGroup: boolean;
    lastMsg: string;
    time: string;
    unread?: boolean;
}

interface CreateGroupModalProps {
    onClose: () => void;
    onCreate: (group: ChatGroup) => Promise<void> | void;
    availableMembers: Array<{ id: string; name: string; role: string; department?: string }>;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
    onClose,
    onCreate,
    availableMembers,
}) => {
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleMember = (id: string) => {
        setSelectedMembers(prev =>
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    const handleCreate = async () => {
        if (!groupName.trim() || selectedMembers.length === 0) return;

        setIsCreating(true);
        setError(null);

        try {
            const memberNames = availableMembers.filter(m => selectedMembers.includes(m.id)).map(m => m.name);
            const newGroup: ChatGroup = {
                id: crypto.randomUUID(),
                name: groupName,
                members: memberNames,
                isGroup: true,
                lastMsg: `Group created with ${selectedMembers.length} members`,
                time: new Date().toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })
            };

            await onCreate(newGroup);
            onClose();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create group';
            logger.error('Error creating group:', err);
            setError(errorMessage);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-text-main">Create Group</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors" disabled={isCreating}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                        <p className="text-sm text-danger">{error}</p>
                    </div>
                )}

                <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group name"
                    disabled={isCreating}
                    className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-text-main bg-white mb-4 disabled:opacity-50 transition-colors"
                />

                <p className="text-xs font-bold text-text-muted uppercase mb-3">Select Members ({selectedMembers.length})</p>
                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                    {availableMembers.map(member => (
                        <label key={member.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${selectedMembers.includes(member.id) ? 'bg-primary/5 border-2 border-primary' : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'} ${isCreating ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input
                                type="checkbox"
                                checked={selectedMembers.includes(member.id)}
                                onChange={() => toggleMember(member.id)}
                                disabled={isCreating}
                                className="size-5 accent-primary"
                            />
                            <div>
                                <p className="font-bold text-text-main text-sm">{member.name}</p>
                                <p className="text-xs text-text-muted">{member.role}</p>
                            </div>
                        </label>
                    ))}
                </div>

                <button
                    onClick={handleCreate}
                    disabled={!groupName.trim() || selectedMembers.length === 0 || isCreating}
                    className="w-full py-4 gradient-primary glow-primary text-white rounded-xl font-bold uppercase disabled:bg-surface-tertiary disabled:shadow-none flex items-center justify-center gap-2 transition-all"
                >
                    {isCreating ? (
                        <>
                            <span className="animate-spin">⏳</span>
                            Creating...
                        </>
                    ) : (
                        'Create Group'
                    )}
                </button>
            </div>
        </ModalOverlay>
    );
};

export default CreateGroupModal;
