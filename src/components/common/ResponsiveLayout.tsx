import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import DesktopLayout, { NavItem } from './DesktopLayout';
import BottomNav, { NavTab } from './BottomNav';
import Header from './Header';

export interface ResponsiveLayoutProps {
    /** Navigation items for desktop sidebar. Falls back to mobileTabs if missing. */
    navItems?: NavItem[];
    /** Navigation items for mobile bottom bar. Falls back to navItems if missing. */
    mobileTabs?: NavTab[];
    /** Currently active tab ID */
    activeTab: string;
    /** Optional active tab ID specifically for mobile BottomNav */
    mobileActiveTab?: string;
    /** Callback when a tab is selected */
    onTabChange: (tabId: string) => void;
    
    /** Common title used in Desktop header and Mobile header */
    title: string;
    /** Subtitle used in Mobile header */
    subtitle?: string;
    
    /** Accent color used in DesktopLayout */
    accentColor?: string;
    /** Title icon used in DesktopLayout */
    titleIcon?: string;
    
    /** Profile click handler used in Mobile header */
    onProfileClick?: () => void;
    /** Messaging navigation handler used in Mobile header */
    onNavigateToMessaging?: () => void;
    
    children: React.ReactNode;
}

const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
    navItems,
    mobileTabs,
    activeTab,
    mobileActiveTab,
    onTabChange,
    title,
    subtitle,
    accentColor = 'violet',
    titleIcon = 'dashboard',
    onProfileClick,
    onNavigateToMessaging,
    children,
}) => {
    const isDesktop = useMediaQuery('(min-width: 768px)');
    
    // Resolve navigation arrays. They share exact same structure (id, label, icon, badge)
    const resolvedNavItems: NavItem[] = navItems || (mobileTabs as NavItem[]) || [];
    const resolvedMobileTabs: NavTab[] = mobileTabs || (navItems as NavTab[]) || [];

    if (isDesktop) {
        return (
            <DesktopLayout
                navItems={resolvedNavItems}
                activeTab={activeTab}
                onTabChange={onTabChange}
                title={title}
                accentColor={accentColor}
                titleIcon={titleIcon}
            >
                {children}
            </DesktopLayout>
        );
    }
    
    // Mobile Layout
    return (
        <div className="flex flex-col h-full bg-background-light min-h-screen text-slate-900 pb-20">
            <Header 
                title={title}
                subtitle={subtitle || title}
                onProfileClick={onProfileClick}
                onNavigateToMessaging={onNavigateToMessaging}
            />
            
            {/* id: destino del enlace "Skip to content" de index.html */}
            <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto w-full relative outline-none">
                {children}
            </main>
            
            {resolvedMobileTabs.length > 0 && (
                <BottomNav 
                    tabs={resolvedMobileTabs}
                    activeTab={mobileActiveTab ?? activeTab}
                    onTabChange={onTabChange}
                />
            )}
        </div>
    );
};

export default ResponsiveLayout;
