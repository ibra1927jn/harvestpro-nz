/**
 * NotificationPanel — In-app notification dropdown
 *
 * Shows recent alerts (compliance, messaging, system) in a clean dropdown.
 * "View All" navigates to the Messaging tab.
 * Clicking outside closes the panel.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMessaging } from '@/context/MessagingContext';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { relativeTime } from '@/i18n/relativeTime';

export interface AppNotification {
    id: string;
    icon: string;
    title: string;
    body: string;
    time: string;
    type: 'alert' | 'message' | 'info';
    read: boolean;
}

interface NotificationPanelProps {
    /** Called when user clicks "View All" — navigate to messaging tab */
    onViewAll?: () => void;
    /** Called to close the panel */
    onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onViewAll, onClose }) => {
    const { t } = useTranslation();
    const { broadcasts, unreadCount, acknowledgeBroadcast } = useMessaging();
    const { appUser } = useAuth();
    const panelRef = useRef<HTMLDivElement>(null);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

    // Build notification feed from broadcasts + system alerts
    useEffect(() => {
        const items: AppNotification[] = [];

        // Add broadcasts as notifications
        if (broadcasts && broadcasts.length > 0) {
            broadcasts.slice(0, 5).forEach(b => {
                // Leído = confirmado por mí (se guarda en el servidor); antes "no leído" era "de las últimas 24 h"
                const seen = !!appUser?.id && (b.acknowledged_by || []).includes(appUser.id);
                items.push({
                    id: `broadcast-${b.id}`,
                    icon: b.priority === 'urgent' ? 'priority_high' : b.priority === 'high' ? 'campaign' : 'chat',
                    title: b.title || t('common.broadcast'),
                    body: b.content || '',
                    time: b.created_at ? relativeTime(t, b.created_at) : t('time.just_now'),
                    type: b.priority === 'urgent' ? 'alert' : 'message',
                    read: seen,
                });
            });
        }

        // Add system-level notifications if none from broadcasts
        if (items.length === 0) {
            items.push({
                id: 'welcome',
                icon: 'waving_hand',
                title: t('notif.welcome_title'),
                body: t('notif.welcome_body'),
                time: t('time.now'),
                type: 'info',
                read: true,
            });
        }

        setNotifications(items);
    }, [broadcasts, appUser?.id, t]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Delay listener to avoid immediate close
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        // Confirmar en el servidor los avisos pendientes
        notifications
            .filter(n => !n.read && n.id.startsWith('broadcast-'))
            .forEach(n => void acknowledgeBroadcast(n.id.replace('broadcast-', '')));
    }, [notifications, acknowledgeBroadcast]);

    const unreadNotifs = notifications.filter(n => !n.read).length;

    const typeIcon = (type: AppNotification['type']) => {
        switch (type) {
            case 'alert': return 'bg-red-100 text-red-600';
            case 'message': return 'bg-indigo-100 text-indigo-600';
            case 'info': return 'bg-slate-100 text-slate-500';
        }
    };

    return (
        <div ref={panelRef}
            className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-600">notifications</span>
                    <h3 className="text-sm font-bold text-slate-800">{t('settings.notifications')}</h3>
                    {(unreadNotifs > 0 || unreadCount > 0) && (
                        <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                            {unreadNotifs + unreadCount}
                        </span>
                    )}
                </div>
                {unreadNotifs > 0 && (
                    <button onClick={markAllRead} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                        {t('notif.mark_all_read')}
                    </button>
                )}
            </div>

            {/* Unread messages summary */}
            {unreadCount > 0 && (
                <button
                    onClick={() => { onViewAll?.(); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors border-b border-slate-100"
                >
                    <div className="size-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span aria-hidden="true" className="material-symbols-outlined text-indigo-600 text-[18px]">chat</span>
                    </div>
                    <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-bold text-indigo-700">{t(unreadCount > 1 ? 'notif.unread_other' : 'notif.unread_one', { n: unreadCount })}</p>
                        <p className="text-[11px] text-indigo-500">{t('notif.tap_to_view')}</p>
                    </div>
                    <span aria-hidden="true" className="material-symbols-outlined text-indigo-400 text-[18px]">chevron_right</span>
                </button>
            )}

            {/* Notification list */}
            <div className="max-h-64 overflow-y-auto">
                {notifications.map(notif => (
                    <div key={notif.id}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0 transition-colors ${!notif.read ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                    >
                        <div className={`size-9 rounded-xl flex items-center justify-center flex-shrink-0 ${typeIcon(notif.type)}`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{notif.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!notif.read ? 'font-bold text-slate-800' : 'font-medium text-slate-700'} truncate`}>
                                {notif.title}
                            </p>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{notif.body}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{notif.time}</p>
                        </div>
                        {!notif.read && (
                            <span className="size-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0"></span>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100">
                <button
                    onClick={() => { onViewAll?.(); onClose(); }}
                    className="w-full py-3 text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                >
                    {t('notif.view_all')}
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
            </div>
        </div>
    );
};

export default NotificationPanel;
