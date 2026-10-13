/**
 * BottomNav.tsx — Unified Mobile Bottom Navigation
 * 
 * Single shared component used by Manager, TeamLeader, and Runner pages.
 * Design: Clean white bar, filled icons on active, subtle pill highlight.
 */
import React from 'react';

export interface NavTab {
    id: string;
    label: string;
    icon: string;
    /** Optional notification badge count */
    badge?: number;
}

interface BottomNavProps {
    tabs: NavTab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ tabs, activeTab, onTabChange }) => {
    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe-bottom shadow-[0_-1px_3px_rgba(0,0,0,0.04)]"
            aria-label="Main navigation"
        >
            {/* h-[60px] bar — buttons stretch full height → 60px touch target each */}
            <div className="flex items-stretch justify-around h-[60px] px-1 max-w-5xl mx-auto">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            aria-current={isActive ? 'page' : undefined}
                            // El contador va en el nombre: un aria-label en un <span> sin rol se ignora
                            aria-label={tab.badge !== undefined && tab.badge > 0 ? `${tab.label} (${tab.badge})` : tab.label}
                            className={`
                                flex flex-col items-center justify-center gap-0.5
                                min-w-[56px] flex-1 relative
                                transition-colors active:scale-95
                                focus-visible:outline-none focus-visible:ring-2
                                focus-visible:ring-violet-500 focus-visible:ring-offset-1
                                ${isActive
                                    ? 'text-violet-600'
                                    : 'text-slate-400 hover:text-slate-600'
                                }
                            `}
                        >
                            {/* Active pill background */}
                            {isActive && (
                                <span className="absolute top-1.5 w-12 h-8 rounded-2xl bg-violet-50 animate-scale-in" aria-hidden="true" />
                            )}

                            {/* Icon */}
                            <div className="relative z-10">
                                <span className={`material-symbols-outlined text-[22px] ${isActive ? 'filled' : ''}`} aria-hidden="true">
                                    {tab.icon}
                                </span>
                                {/* Badge dot */}
                                {tab.badge !== undefined && tab.badge > 0 && (
                                    <span
                                        className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"
                                        aria-hidden="true"
                                    />
                                )}
                            </div>

                            {/* Label */}
                            <span className="relative z-10 text-[11px] font-semibold leading-none">
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default BottomNav;
