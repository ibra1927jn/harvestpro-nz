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
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useTranslation } from '@/i18n';
import { usePickerDrawerData } from './usePickerDrawerData';
import PickerDrawerToday from './PickerDrawerToday';
import PickerDrawerHistory from './PickerDrawerHistory';
import { drawerTheme, statusLabelKey } from './drawerTheme';
import {
    QualityRing,
    RiskBadge as RiskBadgeComponent,
    TabButton as TabBtn,
    RunnerPanel,
    TeamLeaderPanel,
    QualityTab,
} from '../common/picker-profile';

type DrawerTab = 'today' | 'history' | 'quality';

const PickerDrawer: React.FC = () => {
    const { t } = useTranslation();
    const pickerId = useHarvestStore(s => s.pickerProfileId);
    const closeDrawer = useHarvestStore(s => s.closePickerProfile);
    const crew = useHarvestStore(s => s.crew);

    const [activeTab, setActiveTab] = useState<DrawerTab>('today');

    const data = usePickerDrawerData(pickerId);
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: closeDrawer, enabled: !!pickerId });

    if (!pickerId) return null;

    const { picker, today, history, isHistoryLoading, role, minWage, pieceRate } = data;

    const isTL = role === 'team_leader';
    const isRunner = role === 'runner';

    // Colores y textos según rol (drawerTheme.ts)
    const { headerBg, avatarBg, roleColor, roleLabelKey } = drawerTheme(role);
    const roleLabel = t(roleLabelKey);

    // Nombre: preferir crew (en memoria) sobre history (backend)
    const displayName = picker?.name ?? history?.profile.name ?? 'Unknown';
    const displayPickerId = picker?.picker_id ?? history?.profile.picker_id ?? pickerId;
    const currentStatus = picker?.status ?? history?.profile.status ?? 'active';

    const statusLabel = t(statusLabelKey(currentStatus));

    // Si no hay picker en crew ni en history, mostrar not_found
    const notFound = !picker && !history && !isHistoryLoading && !today.empty === false;

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
                <button aria-label="Close"
                    onClick={closeDrawer}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
                </button>

                {isHistoryLoading && !picker ? (
                    /* Cargando y sin datos en crew todavía */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full border-3 border-primary-light border-t-primary animate-spin mx-auto mb-3" />
                            <p className="text-sm text-text-muted">{t('panel.loading')}</p>
                        </div>
                    </div>
                ) : notFound ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-5xl text-slate-300 mb-2 block">
                                person_off
                            </span>
                            <p className="text-sm text-text-muted">{t('panel.not_found')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 space-y-5">
                        {/* Profile Header */}
                        <div className={`rounded-2xl p-5 -mx-1 ${headerBg}`}>
                            <div className="flex items-start gap-4">
                                <div
                                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${avatarBg}`}
                                >
                                    {displayName.charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-black text-text-main">{displayName}</h2>
                                    <p className="text-xs text-text-muted">ID: {displayPickerId}</p>
                                    <p
                                        className="text-xs font-bold mt-0.5 capitalize"
                                        style={{ color: roleColor }}
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
                                {history?.quality && history.quality.total > 0 && !isTL && !isRunner && (
                                    <QualityRing score={history.quality.score} />
                                )}
                            </div>
                        </div>

                        {/* Risk Badges (solo pickers) */}
                        {!isTL && !isRunner && history?.riskBadges && history.riskBadges.length > 0 && (
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
                        {!isTL && !isRunner && (
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
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default PickerDrawer;
