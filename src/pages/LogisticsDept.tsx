/**
 * LOGISTICS DEPARTMENT — LogisticsDept.tsx
 *
 * Página del rol Logística: la navegación (barra inferior / lateral) lleva las
 * pestañas y el cuerpo es `LogisticsWorkspace`, el mismo que ve el manager en
 * su pestaña Logística (una sola pantalla para toda la logística).
 */
import React, { useState, useCallback } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import LogisticsWorkspace, { isLogisticsTabId, type LogisticsTabId } from '@/components/views/logistics/LogisticsWorkspace';
import { LOG_NAV_ITEMS } from '@/config/navigation/logistics.nav';
import { useTranslation } from '@/i18n';
import { useMessaging } from '@/context/MessagingContext';
import { CHAT_TAB_ID, withChatBadge } from '@/config/navigation/chat.nav';
import ChatTabView from '@/components/common/messaging/ChatTabView';

const LogisticsDept: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<LogisticsTabId | typeof CHAT_TAB_ID>('fleet');
    const { unreadCount } = useMessaging();
    const [pendingRequests, setPendingRequests] = useState(0);
    const onPendingRequests = useCallback((n: number) => setPendingRequests(n), []);

    const navItems = withChatBadge(LOG_NAV_ITEMS.map(item => ({
        ...item,
        badge: item.id === 'requests' ? pendingRequests : undefined,
    })), unreadCount);

    return (
        <ResponsiveLayout
            navItems={navItems}
            mobileTabs={navItems}
            activeTab={activeTab}
            onTabChange={(id) => { if (isLogisticsTabId(id) || id === CHAT_TAB_ID) setActiveTab(id); }}
            title={t('roles.logistics')}
            subtitle={t('logi.subtitle')}
            accentColor="teal"
            titleIcon="local_shipping"
        >
            {/* El espacio de logística sigue montado bajo el chat: el contador de solicitudes no se pierde */}
            {activeTab === CHAT_TAB_ID && <ChatTabView />}
            <div hidden={activeTab === CHAT_TAB_ID}>
                <LogisticsWorkspace activeTab={activeTab === CHAT_TAB_ID ? 'fleet' : activeTab} onTabChange={setActiveTab} onPendingRequests={onPendingRequests} />
            </div>
        </ResponsiveLayout>
    );
};

export default LogisticsDept;
