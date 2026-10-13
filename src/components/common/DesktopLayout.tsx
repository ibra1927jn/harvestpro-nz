/**
 * DesktopLayout.tsx — Sidebar Layout for Back-Office Roles
 * 
 * Used by: Admin, HR Admin, Payroll Admin, Manager (desktop breakpoint)
 * Features: Collapsible sidebar, header with user info, content area
 */
import React, { useRef, useState } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useAuth } from '@/context/AuthContext';
import { useMessaging } from '@/context/MessagingContext';
import { useNavigate } from 'react-router-dom';
import NotificationPanel from './NotificationPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';

export interface NavItem {
    id: string;
    label: string;
    icon: string;
    badge?: number;
}

interface DesktopLayoutProps {
    /** Navigation items for the sidebar */
    navItems: NavItem[];
    /** Currently active nav item id */
    activeTab: string;
    /** Callback when a nav item is clicked */
    onTabChange: (tabId: string) => void;
    /** Page title displayed in the header */
    title: string;
    /** Accent color for the sidebar active state.
     *  Valid values: 'indigo' | 'purple' | 'orange' | 'red' | 'teal' | 'emerald' | 'green' | 'sky' | 'violet' | 'blue' | 'amber'
     */
    accentColor?: string;
    /** Icon displayed next to the title */
    titleIcon?: string;
    /** Children content to render in the main area */
    children: React.ReactNode;
}

const DesktopLayout: React.FC<DesktopLayoutProps> = ({
    navItems,
    activeTab,
    onTabChange,
    title,
    accentColor = 'violet',
    titleIcon = 'dashboard',
    children,
}) => {
    const { appUser, signOut } = useAuth();
    const { unreadCount } = useMessaging();
    const navigate = useNavigate();
    // Persiste el estado del sidebar en localStorage para que no se resetee al navegar entre páginas
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const drawerRef = useRef<HTMLElement>(null);
    // Menú móvil como diálogo modal: foco dentro, Escape cierra, foco de vuelta al botón
    useDialogA11y(drawerRef, { onClose: () => setMobileMenuOpen(false), enabled: mobileMenuOpen });
    const [showNotifications, setShowNotifications] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login', { replace: true });
    };

    const accentClasses: Record<string, { bg: string; text: string; hover: string; border: string; ring: string }> = {
        indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  hover: 'hover:bg-indigo-50/60',  border: 'border-indigo-500',  ring: 'ring-indigo-200' },
        purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  hover: 'hover:bg-purple-50/60',  border: 'border-purple-500',  ring: 'ring-purple-200' },
        violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  hover: 'hover:bg-violet-50/60',  border: 'border-violet-500',  ring: 'ring-violet-200' },
        orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  hover: 'hover:bg-orange-50/60',  border: 'border-orange-500',  ring: 'ring-orange-200' },
        red:     { bg: 'bg-red-50',     text: 'text-red-700',     hover: 'hover:bg-red-50/60',     border: 'border-red-500',     ring: 'ring-red-200' },
        teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    hover: 'hover:bg-teal-50/60',    border: 'border-teal-500',    ring: 'ring-teal-200' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-50/60', border: 'border-emerald-500', ring: 'ring-emerald-200' },
        green:   { bg: 'bg-green-50',   text: 'text-green-700',   hover: 'hover:bg-green-50/60',   border: 'border-green-500',   ring: 'ring-green-200' },
        sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     hover: 'hover:bg-sky-50/60',     border: 'border-sky-500',     ring: 'ring-sky-200' },
        blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    hover: 'hover:bg-blue-50/60',    border: 'border-blue-500',    ring: 'ring-blue-200' },
        amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   hover: 'hover:bg-amber-50/60',   border: 'border-amber-500',   ring: 'ring-amber-200' },
    };

    // Normalise: strip # prefix (hex values passed incorrectly) and fall back to indigo
    const normalisedColor = (accentColor || 'indigo').replace(/^#/, '');
    const accent = accentClasses[normalisedColor] ?? accentClasses.indigo;

    return (
        <div className="desktop-layout h-screen flex bg-slate-50 font-display overflow-hidden">
            {/* Skip link: lo pone index.html (antes había dos) */}
            {/* ── Sidebar ── */}
            <aside className={`desktop-sidebar bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out ${collapsed ? 'w-[68px]' : 'w-[260px]'} hidden lg:flex`}>
                {/* Logo / Brand */}
                <div className="h-16 flex items-center px-4 border-b border-slate-100">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-9 h-9 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-white text-[20px]">{titleIcon}</span>
                        </div>
                        {!collapsed && (
                            <div className="min-w-0">
                                <h1 className="text-sm font-bold text-slate-800 truncate">HarvestPro</h1>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider truncate">{title}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onTabChange(item.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 nav-item-glow
                                    ${isActive
                                        ? `${accent.bg} ${accent.text} border-l-3 ${accent.border} shadow-sm active`
                                        : `text-slate-600 hover:text-slate-800 ${accent.hover}`
                                    }
                                    ${collapsed ? 'justify-center' : ''}
                                `}
                                title={collapsed ? item.label : undefined}
                                aria-label={item.label}
                            >
                                <span aria-hidden="true" className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'font-variation-fill' : ''}`}>
                                    {item.icon}
                                </span>
                                {!collapsed && (
                                    <span className="truncate">{item.label}</span>
                                )}
                                {!collapsed && item.badge !== undefined && item.badge > 0 && (
                                    <span className="ml-auto bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Collapse Toggle + User */}
                <div className="border-t border-slate-100 px-3 py-3">
                    <button
                        onClick={() => {
                            const next = !collapsed;
                            setCollapsed(next);
                            try { localStorage.setItem('sidebar-collapsed', String(next)); } catch { /* quota */ }
                        }}
                        className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            {collapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                    </button>

                    <div className={`mt-2 flex items-center gap-2 px-2 ${collapsed ? 'justify-center' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">
                                {(appUser?.full_name || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{appUser?.full_name || 'User'}</p>
                                <p className="text-[10px] text-slate-400 truncate">{appUser?.email}</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* ── Main Area ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
                    {/* Mobile hamburger */}
                    <button
                        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileMenuOpen}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[22px]">
                            {mobileMenuOpen ? 'close' : 'menu'}
                        </span>
                    </button>

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2">
                        <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${accent.text}`}>{titleIcon}</span>
                        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm text-slate-500 capitalize">
                            {navItems.find(n => n.id === activeTab)?.label || activeTab}
                        </span>
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <div className="relative">
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 relative"
                                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">notifications</span>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                            {showNotifications && (
                                <NotificationPanel
                                    onViewAll={() => { onTabChange('messaging'); setShowNotifications(false); }}
                                    onClose={() => setShowNotifications(false)}
                                />
                            )}
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                            title="Sign Out"
                            aria-label="Sign out"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">logout</span>
                        </button>
                    </div>
                </header>

                {/* Content */}
                {/* tabIndex 0: es el contenedor con scroll, debe poder enfocarse para scroll con teclado */}
                <main id="main-content" tabIndex={0} className="flex-1 overflow-y-auto p-4 lg:p-6">
                    {children}
                </main>
            </div>

            {/* ── Mobile Overlay Menu ── */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
                    <aside
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        className="absolute left-0 top-0 h-full w-[280px] bg-white shadow-xl flex flex-col"
                    >
                        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
                                    <span aria-hidden="true" className="material-symbols-outlined text-white text-[20px]">{titleIcon}</span>
                                </div>
                                <div>
                                    <h1 className="text-sm font-bold text-slate-800">HarvestPro</h1>
                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{title}</p>
                                </div>
                            </div>
                            <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400" aria-label="Close menu">
                                <span aria-hidden="true" className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <nav className="flex-1 py-4 px-3 space-y-1">
                            {navItems.map((item) => {
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => { onTabChange(item.id); setMobileMenuOpen(false); }}
                                        aria-label={item.label}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                                            ${isActive ? `${accent.bg} ${accent.text}` : `text-slate-600 ${accent.hover}`}
                                        `}
                                    >
                                        <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${isActive ? 'font-variation-fill' : ''}`}>
                                            {item.icon}
                                        </span>
                                        <span>{item.label}</span>
                                        {item.badge !== undefined && item.badge > 0 && (
                                            <span className="ml-auto bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                {item.badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="border-t border-slate-100 p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <span className="text-white text-sm font-bold">
                                        {(appUser?.full_name || 'U').charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 truncate">{appUser?.full_name || 'User'}</p>
                                    <p className="text-xs text-slate-400 truncate">{appUser?.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                aria-label="Sign out"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">logout</span>
                                Sign Out
                            </button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default DesktopLayout;
