/**
 * PickerDrawer — Container + tabs. Despacha por rol.
 *
 * Roles:
 *   team_leader → TeamLeaderPanel  (sin tabs de métricas)
 *   runner      → RunnerPanel      (sin tabs de métricas)
 *   picker      → 3 tabs: today / history / quality
 *
 * Triggered globalmente via Zustand UISlice (openPickerProfile).
 * Datos provistos por usePickerDrawerData — misma fuente que Dashboard.
 * Piezas de marcado en PickerDrawerParts.tsx; valores de reserva en drawerTheme.ts.
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useTranslation } from '@/i18n';
import { usePickerDrawerData } from './usePickerDrawerData';
import type { PickerDrawerData } from './usePickerDrawerData';
import { drawerTheme, drawerProfileOf, statusLabelKey } from './drawerTheme';
import { DrawerLoading, DrawerNotFound, ProfileHeader, PickerTabs } from './PickerDrawerParts';
import type { DrawerTab } from './PickerDrawerParts';
import { RiskBadge as RiskBadgeComponent, RunnerPanel, TeamLeaderPanel } from '../common/picker-profile';
import type { Picker } from '@/types';

interface DrawerBodyProps {
    data: PickerDrawerData;
    pickerId: string;
    crew: Picker[];
    activeTab: DrawerTab;
    setActiveTab: (tab: DrawerTab) => void;
}

/** Perfil + contenido según el rol (team leader, runner o picker con pestañas) */
const DrawerBody: React.FC<DrawerBodyProps> = ({ data, pickerId, crew, activeTab, setActiveTab }) => {
    const { t } = useTranslation();
    const { picker, today, history, isHistoryLoading, role, minWage, pieceRate } = data;
    const isTL = role === 'team_leader';
    const isRunner = role === 'runner';
    const isPicker = !isTL && !isRunner;
    // Colores y textos según rol (drawerTheme.ts)
    const theme = drawerTheme(role);
    const profile = drawerProfileOf(pickerId, picker, history, isHistoryLoading, today.empty);
    const showRing = isPicker && !!history?.quality && history.quality.total > 0;

    return (
        <div className="p-5 space-y-5">
            {/* Profile Header */}
            <ProfileHeader
                theme={theme}
                displayName={profile.displayName}
                displayPickerId={profile.displayPickerId}
                currentStatus={profile.currentStatus}
                statusLabel={t(statusLabelKey(profile.currentStatus))}
                roleLabel={t(theme.roleLabelKey)}
                qualityScore={showRing && history ? history.quality.score : null}
            />

            {/* Risk Badges (solo pickers) */}
            {isPicker && history?.riskBadges && history.riskBadges.length > 0 && (
                <div className="space-y-2">
                    {history.riskBadges.map(badge => (
                        <RiskBadgeComponent key={badge.type} badge={badge} />
                    ))}
                </div>
            )}

            {/* TL: sin tabs */}
            {isTL && picker && (
                <TeamLeaderPanel
                    leader={picker}
                    crew={crew}
                    pieceRate={pieceRate}
                    minWage={minWage}
                />
            )}

            {/* Runner: sin tabs */}
            {isRunner && picker && (
                <RunnerPanel member={picker} crew={crew} />
            )}

            {/* Picker: 3 tabs */}
            {isPicker && (
                <PickerTabs
                    today={today}
                    picker={picker}
                    crew={crew}
                    history={history}
                    isHistoryLoading={isHistoryLoading}
                    minWage={minWage}
                    pieceRate={pieceRate}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />
            )}
        </div>
    );
};

const PickerDrawer: React.FC = () => {
    const pickerId = useHarvestStore(s => s.pickerProfileId);
    const closeDrawer = useHarvestStore(s => s.closePickerProfile);
    const crew = useHarvestStore(s => s.crew);

    const [activeTab, setActiveTab] = useState<DrawerTab>('today');

    const data = usePickerDrawerData(pickerId);
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: closeDrawer, enabled: !!pickerId });

    if (!pickerId) return null;

    const { picker, today, history, isHistoryLoading } = data;
    const { displayName, notFound } = drawerProfileOf(pickerId, picker, history, isHistoryLoading, today.empty);

    let content: React.ReactNode;
    if (isHistoryLoading && !picker) {
        /* Cargando y sin datos en crew todavía */
        content = <DrawerLoading />;
    } else if (notFound) {
        content = <DrawerNotFound />;
    } else {
        content = <DrawerBody data={data} pickerId={pickerId} crew={crew} activeTab={activeTab} setActiveTab={setActiveTab} />;
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
                onClick={closeDrawer}
            />

            {/* Drawer */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={displayName} className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto animate-slide-in-right">
                {/* Botón de cierre */}
                <button aria-label={t('common.close')}
                    onClick={closeDrawer}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
                </button>

                {content}
            </div>
        </>
    );
};

export default PickerDrawer;
