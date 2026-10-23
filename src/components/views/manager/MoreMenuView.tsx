/**
 * MoreMenuView — Mobile secondary navigation grid.
 * Replaces tabs removed from BottomNav for mobile users.
 */
import React from 'react';
import { Tab } from '@/types';
import { useTranslation } from '@/i18n';

interface MoreMenuItem {
    id: Tab;
    label: string;
    icon: string;
    description: string;
    color: string;
}

const MENU_ITEMS: MoreMenuItem[] = [
    { id: 'insights', label: 'nav.insights', icon: 'insights', description: 'mgr.more.insights_desc', color: 'bg-purple-500' },
    { id: 'messaging', label: 'nav.messaging', icon: 'chat', description: 'mgr.more.messaging_desc', color: 'bg-emerald-500' },
    { id: 'structure', label: 'nav.structure', icon: 'grid_view', description: 'mgr.more.structure_desc', color: 'bg-emerald-600' },
    { id: 'settings', label: 'nav.settings', icon: 'settings', description: 'mgr.more.settings_desc', color: 'bg-slate-500' },
];

interface MoreMenuViewProps {
    onNavigate: (tab: Tab) => void;
}

const MoreMenuView: React.FC<MoreMenuViewProps> = ({ onNavigate }) => {
    const { t } = useTranslation();
    return (
        <div className="p-4 md:p-6 space-y-4 animate-fade-in">
            <div>
                <h2 className="text-xl font-black text-text-main">{t('nav.more')}</h2>
                <p className="text-sm text-text-muted">{t('mgr.more.subtitle')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {MENU_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className="glass-card glass-card-hover p-4 flex flex-col items-start gap-3 text-left transition-all active:scale-[0.97] active:ring-2 active:ring-primary/30 group"
                    >
                        <div className={`${item.color} text-white p-2.5 rounded-xl shadow-lg group-hover:scale-110 transition-transform`}>
                            <span aria-hidden="true" className="material-symbols-outlined text-xl">{item.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-text-main text-sm">{t(item.label)}</h3>
                            <p className="text-xs text-text-muted mt-0.5 leading-tight">{t(item.description)}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default MoreMenuView;
