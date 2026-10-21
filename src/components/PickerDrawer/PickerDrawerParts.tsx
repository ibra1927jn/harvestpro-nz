/**
 * Piezas del PickerDrawer (marcado sin cambios, sacado del contenedor):
 * estados de carga / no encontrado, cabecera de perfil y pestañas del picker.
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import type { Picker } from '@/types';
import type { PickerHistory } from '@/services/picker-history.service';
import PickerDrawerToday from './PickerDrawerToday';
import PickerDrawerHistory from './PickerDrawerHistory';
import type { PickerTodayData } from './usePickerDrawerData';
import type { DrawerTheme } from './drawerTheme';
import { QualityRing, TabButton as TabBtn, QualityTab } from '../common/picker-profile';
import UserAvatar from '../common/account/UserAvatar';

export type DrawerTab = 'today' | 'history' | 'quality';

export const DrawerLoading: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <div className="w-12 h-12 rounded-full border-3 border-primary-light border-t-primary animate-spin mx-auto mb-3" />
                <p className="text-sm text-text-muted">{t('panel.loading')}</p>
            </div>
        </div>
    );
};

export const DrawerNotFound: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <span aria-hidden="true" className="material-symbols-outlined text-5xl text-slate-300 mb-2 block">
                    person_off
                </span>
                <p className="text-sm text-text-muted">{t('panel.not_found')}</p>
            </div>
        </div>
    );
};

interface ProfileHeaderProps {
    theme: DrawerTheme;
    /** Id de la persona: si tiene cuenta con foto (Mi cuenta), se enseña; si no, la inicial */
    userId?: string;
    displayName: string;
    displayPickerId: string;
    currentStatus: string;
    statusLabel: string;
    roleLabel: string;
    /** Anillo de calidad: solo pickers con inspecciones */
    qualityScore: number | null;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
    theme, userId, displayName, displayPickerId, currentStatus, statusLabel, roleLabel, qualityScore,
}) => (
    <div className={`rounded-2xl p-5 -mx-1 ${theme.headerBg}`}>
        <div className="flex items-start gap-4">
            <UserAvatar
                name={displayName}
                userId={userId}
                className={`w-14 h-14 rounded-2xl text-white shadow-lg ${theme.avatarBg}`}
                textClassName="text-xl font-black"
            />
            <div className="flex-1">
                <h2 className="text-lg font-black text-text-main">{displayName}</h2>
                <p className="text-xs text-text-muted">ID: {displayPickerId}</p>
                <p
                    className="text-xs font-bold mt-0.5 capitalize"
                    style={{ color: theme.roleColor }}
                >
                    {roleLabel}
                </p>
                <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        currentStatus === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                    }`}
                >
                    {statusLabel.toUpperCase()}
                </span>
            </div>
            {qualityScore !== null && <QualityRing score={qualityScore} />}
        </div>
    </div>
);

interface PickerTabsProps {
    today: PickerTodayData;
    picker: Picker | undefined;
    crew: Picker[];
    history: PickerHistory | null;
    isHistoryLoading: boolean;
    minWage: number;
    pieceRate: number;
    /** La pestaña vive en el contenedor: se mantiene al abrir otra persona */
    activeTab: DrawerTab;
    setActiveTab: (tab: DrawerTab) => void;
}

/** Picker: pestañas hoy / historial / calidad */
export const PickerTabs: React.FC<PickerTabsProps> = ({
    today, picker, crew, history, isHistoryLoading, minWage, pieceRate, activeTab, setActiveTab,
}) => {
    const { t } = useTranslation();
    return (
        <>
            <div className="flex gap-1 bg-slate-100 rounded-full p-1">
                <TabBtn
                    active={activeTab === 'today'}
                    label={t('panel.tabs.today')}
                    onClick={() => setActiveTab('today')}
                />
                <TabBtn
                    active={activeTab === 'history'}
                    label={t('panel.tabs.history')}
                    onClick={() => setActiveTab('history')}
                />
                <TabBtn
                    active={activeTab === 'quality'}
                    label={t('panel.tabs.quality')}
                    onClick={() => setActiveTab('quality')}
                />
            </div>

            {activeTab === 'today' && (
                <PickerDrawerToday
                    today={today}
                    picker={picker}
                    crew={crew}
                    minWage={minWage}
                    pieceRate={pieceRate}
                />
            )}
            {activeTab === 'history' && (
                <PickerDrawerHistory
                    history={history}
                    isLoading={isHistoryLoading}
                />
            )}
            {activeTab === 'quality' && history?.quality && (
                <QualityTab quality={history.quality} />
            )}
            {activeTab === 'quality' && !history?.quality && (
                <div className="text-center py-8 text-text-muted text-sm">
                    {t('panel.no_data')}
                </div>
            )}
        </>
    );
};
