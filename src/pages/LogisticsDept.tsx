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

const LogisticsDept: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<LogisticsTabId>('fleet');
    const [pendingRequests, setPendingRequests] = useState(0);
    const onPendingRequests = useCallback((n: number) => setPendingRequests(n), []);

    const navItems = LOG_NAV_ITEMS.map(item => ({
        ...item,
        badge: item.id === 'requests' ? pendingRequests : undefined,
    }));

    return (
        <ResponsiveLayout
            navItems={navItems}
            mobileTabs={navItems}
            activeTab={activeTab}
            onTabChange={(id) => { if (isLogisticsTabId(id)) setActiveTab(id); }}
            title={t('roles.logistics')}
            subtitle={t('logi.subtitle')}
            accentColor="teal"
            titleIcon="local_shipping"
        >
            <LogisticsWorkspace activeTab={activeTab} onTabChange={setActiveTab} onPendingRequests={onPendingRequests} />
        </ResponsiveLayout>
    );
};

export default LogisticsDept;
