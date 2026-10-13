/**
 * MessagingSidebar — Chat list & broadcast list panel
 */
import React, { useMemo } from 'react';
import { ChatGroup } from '../../../context/MessagingContext';
import type { Broadcast } from '../../../types';
import { getAvatarColor, formatTime } from './messagingHelpers';
import { useTranslation } from '@/i18n';

interface Props {
    activeTab: 'alerts' | 'chats';
    setActiveTab: (tab: 'alerts' | 'chats') => void;
    chatGroups: ChatGroup[];
    broadcasts: Broadcast[];
    selectedChat: ChatGroup | null;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    unreadCounts: Record<string, number>;
    isManager: boolean;
    onSelectChat: (chat: ChatGroup) => void;
    onNewChat: () => void;
    onNewBroadcast: () => void;
    isSidebarOpen: boolean;
}

const MessagingSidebar: React.FC<Props> = ({
    activeTab, setActiveTab, chatGroups, broadcasts, selectedChat,
    searchQuery, setSearchQuery, unreadCounts, isManager,
    onSelectChat, onNewChat, onNewBroadcast, isSidebarOpen,
}) => {
    const { t } = useTranslation();
    const filteredChats = useMemo(() => {
        if (!searchQuery.trim()) return chatGroups;
        const q = searchQuery.toLowerCase();
        return chatGroups.filter(c => c.name.toLowerCase().includes(q));
    }, [chatGroups, searchQuery]);

    const filteredBroadcasts = useMemo(() => {
        if (!searchQuery.trim()) return broadcasts;
        const q = searchQuery.toLowerCase();
        return broadcasts.filter(b => b.title.toLowerCase().includes(q) || b.content.toLowerCase().includes(q));
    }, [broadcasts, searchQuery]);

    return (
        <aside className={`${isSidebarOpen ? 'w-full md:w-96' : 'hidden md:flex md:w-0'} flex flex-col border-r border-slate-200/80 bg-white transition-all duration-300 z-40`}>
            {/* Header */}
            <div className="p-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <span aria-hidden="true" className="material-symbols-outlined text-white text-lg">forum</span>
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 tracking-tight">{t('chat.field_comms')}</h2>
                            <p className="text-[10px] text-slate-400 font-medium -mt-0.5">{t('chat.conversations_n', { n: chatGroups.length })}</p>
                        </div>
                    </div>
                    <button aria-label={t('chat.new_chat')} onClick={onNewChat} className="size-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition active:scale-95">
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">edit_square</span>
                    </button>
                </div>
                {/* Search */}
                <div className="relative">
                    <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-lg">search</span>
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('chat.search')} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition font-medium placeholder:text-slate-300" />
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 pb-2">
                <div className="flex bg-slate-100/80 p-1 rounded-xl">
                    <button onClick={() => setActiveTab('chats')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'chats' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">chat</span>{t('chat.chats')}
                        {chatGroups.length > 0 && <span className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{chatGroups.length}</span>}
                    </button>
                    <button onClick={() => setActiveTab('alerts')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'alerts' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">campaign</span>{t('chat.alerts')}
                        {broadcasts.length > 0 && <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{broadcasts.length}</span>}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {activeTab === 'alerts' ? (
                    <div className="p-3 space-y-2">
                        {isManager && (
                            <button onClick={onNewBroadcast} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-[0.98] mb-1">
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">campaign</span>{t('chat.new_broadcast')}
                            </button>
                        )}
                        {filteredBroadcasts.length === 0 ? (
                            <div className="text-center py-16 px-6">
                                <div className="size-16 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center">
                                    <span aria-hidden="true" className="material-symbols-outlined text-3xl text-amber-300">notifications_off</span>
                                </div>
                                <p className="text-sm font-bold text-slate-300">{t('chat.no_alerts')}</p>
                                <p className="text-xs text-slate-300 mt-1">{t('chat.no_alerts_desc')}</p>
                            </div>
                        ) : (
                            filteredBroadcasts.map(b => (
                                <div key={b.id} className={`p-3.5 rounded-xl border transition group cursor-pointer hover:shadow-sm ${b.priority === 'urgent' ? 'bg-red-50/50 border-red-200/50 hover:border-red-300' : b.priority === 'high' ? 'bg-amber-50/50 border-amber-200/50 hover:border-amber-300' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${b.priority === 'urgent' ? 'bg-red-500 text-white' : b.priority === 'high' ? 'bg-amber-500 text-white' : 'bg-indigo-100 text-indigo-600'}`}>{t(`chat.priority.${b.priority || 'normal'}`)}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{formatTime(b.created_at)}</span>
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-800 mb-0.5">{b.title}</h4>
                                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{b.content}</p>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="p-3 space-y-1">
                        {filteredChats.length === 0 && !searchQuery ? (
                            <div className="text-center py-16 px-6">
                                <div className="size-16 mx-auto mb-3 rounded-2xl bg-indigo-50 flex items-center justify-center">
                                    <span aria-hidden="true" className="material-symbols-outlined text-3xl text-indigo-300">chat_bubble</span>
                                </div>
                                <p className="text-sm font-bold text-slate-300">{t('chat.no_conversations')}</p>
                                <p className="text-xs text-slate-300 mt-1">{t('chat.no_conversations_desc')}</p>
                                <button onClick={onNewChat} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition">{t('chat.start_chat')}</button>
                            </div>
                        ) : filteredChats.length === 0 ? (
                            <div className="text-center py-10 opacity-50"><p className="text-xs font-medium">{t('chat.no_results_for', { q: searchQuery })}</p></div>
                        ) : (
                            filteredChats.map((chat, chatIdx) => {
                                const isActive = selectedChat?.id === chat.id;
                                return (
                                    <button key={chat.id} onClick={() => onSelectChat(chat)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl chat-item-hover anim-delay ${isActive ? 'bg-indigo-50 shadow-sm ring-1 ring-indigo-200/50' : 'hover:bg-slate-50'}`}
                                        style={{ '--delay': `${chatIdx * 50}ms` } as React.CSSProperties}>
                                        <div className="relative">
                                            <div className={`size-12 rounded-full bg-gradient-to-br ${getAvatarColor(chat.name)} flex items-center justify-center font-bold text-white text-sm shadow-sm`}>
                                                {chat.isGroup ? <span aria-hidden="true" className="material-symbols-outlined text-lg">groups</span> : chat.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                            </div>
                                            {!chat.isGroup && <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-emerald-400 border-2 border-white online-dot" title={t('common.online')}></div>}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <h4 className={`text-sm font-bold truncate ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>{chat.name}</h4>
                                                <span className="text-[10px] text-slate-400 font-medium ml-2 shrink-0">{chat.time}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {chat.isGroup && <span className="text-[10px] text-slate-400">👥 {chat.members.length}</span>}
                                                <p className="text-xs text-slate-400 truncate">{chat.lastMsg || t('chat.no_messages')}</p>
                                            </div>
                                        </div>
                                        {(unreadCounts[chat.id] || (chat.unreadCount ?? 0)) > 0 && (
                                            <span className="shrink-0 size-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center animate-scale-in">
                                                {(unreadCounts[chat.id] || chat.unreadCount || 0) > 9 ? '9+' : (unreadCounts[chat.id] || chat.unreadCount)}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default MessagingSidebar;
