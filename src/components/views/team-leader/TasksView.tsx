import { buttonLike } from '@/utils/pressable';
import React, { useState, useMemo } from 'react';
import RowHistory from '@/components/common/row-history/RowHistory';
import { useAuth } from '@/context/AuthContext';
import { useMessaging } from '../../../context/MessagingContext';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import RowAssignmentModal, { PickerForAssignment } from '../../modals/RowAssignmentModal';
import { HeatMapView } from '../manager/HeatMapView';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useTranslation } from '@/i18n';
import { formatNZD } from '@/utils/nzFormat';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

const TARGET_BUCKETS_PER_ROW = 60;

const TasksView = () => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const { rowAssignments, orchard, bucketRecords, assignRow, crew, settings } = useHarvest();
    const { broadcasts } = useMessaging();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Calculate Dynamic Target
    const minWage = settings?.min_wage_rate || PAY_RULES.minWageFloor;
    const pieceRate = settings?.piece_rate || 6.50;
    const targetBucketsPerHour = pieceRate > 0 ? (minWage / pieceRate) : 0;

    // Obtener última alerta REAL (Filtrar por prioridad alta/urgente, rol manager y ventana de 12h)
    const latestAlert = useMemo(() => {
        if (!broadcasts || broadcasts.length === 0) return null;

        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

        return broadcasts.find(b =>
            (b.priority === 'urgent' || b.priority === 'high') &&
            new Date(b.created_at || '') > twelveHoursAgo
        );
    }, [broadcasts]);



    const getRowProgress = (rowNumber: number) => {
        const rowBuckets = bucketRecords.filter(
            r => r.row_number === rowNumber &&
                new Date(r.scanned_at || '').toDateString() === new Date().toDateString()
        ).length;

        return Math.min((rowBuckets / TARGET_BUCKETS_PER_ROW) * 100, 100);
    };

    const pickersForAssignment: PickerForAssignment[] = crew.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        idNumber: p.picker_id,
        status: p.status === 'active' ? 'Active' : p.status === 'break' ? 'Break' : 'Off Duty'
    }));

    return (
        <div className="flex flex-col h-full bg-background-light">
            {/* MAP SECTION */}
            <div className="h-[45vh] w-full relative z-0 bg-slate-200">
                <ComponentErrorBoundary componentName="Heat Map">
                    <HeatMapView />
                </ComponentErrorBoundary>
                <div className="absolute top-0 left-0 w-full z-20 bg-gradient-to-b from-black/60 to-transparent p-4 pb-12 pointer-events-none">
                    <div className="flex justify-between items-center pointer-events-auto">
                        <div>
                            <h1 className="text-lg font-black text-white shadow-sm tracking-tight">{t('tl.tasks.map_title')}</h1>
                            <p className="text-xs text-white/90 font-medium shadow-sm">{orchard?.name || t('common.loading')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* CONTENT SECTION */}
            <div className="flex-1 bg-background-light -mt-6 rounded-t-3xl relative z-10 overflow-y-auto shadow-[0_-4px_20px_rgba(0,0,0,0.1)] pb-24">
                <div className="w-12 h-1.5 bg-border-light rounded-full mx-auto my-3"></div>

                <div className="px-4 space-y-5">
                    {/* TARGET WIDGET */}
                    <div className="bg-surface-white rounded-2xl p-4 border border-border-light shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-text-sub uppercase tracking-wider block mb-0.5">{t('tl.tasks.min_target')}</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-primary-vibrant">{targetBucketsPerHour.toFixed(1)}</span>
                                <span className="text-xs font-bold text-text-sub">{t('tl.tasks.bkts_hr')}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-bold text-text-sub uppercase tracking-wider block mb-0.5">{t('tl.piece_rate')}</span>
                            <span className="text-lg font-black text-text-main">{formatNZD(pieceRate)}</span>
                        </div>
                    </div>

                    {/* Recorrido de filas de mi equipo */}
                    {appUser?.id && <RowHistory teamLeaderId={appUser.id} title={t('tl.tasks.my_rows')} />}

                    {/* BROADCASTS */}
                    {latestAlert && (
                        <div className={`rounded-xl p-4 border shadow-sm relative overflow-hidden ${latestAlert.priority === 'urgent' ? 'border-primary/30 bg-primary/5' : 'border-warning/30 bg-warning/5'}`}>
                            <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 size-8 rounded-full flex items-center justify-center mt-0.5 ${latestAlert.priority === 'urgent' ? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning'}`}>
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm">campaign</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-text-main font-bold text-sm">{latestAlert.title}</h3>
                                    <p className="text-sm text-text-sub mt-1 leading-snug">{latestAlert.content}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ROW ASSIGNMENTS */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-text-main text-lg flex items-center gap-2">
                                <span aria-hidden="true" className="material-symbols-outlined text-primary">format_list_bulleted</span>
                                {t('tl.tasks.active_rows')}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="text-primary-vibrant text-xs font-bold uppercase flex items-center gap-1 bg-white border border-border-light px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">add</span> {t('tl.tasks.assign')}
                            </button>
                        </div>

                        {rowAssignments && rowAssignments.length > 0 ? (
                            <div className="space-y-3">
                                {rowAssignments.map((assignment) => {
                                    const progress = getRowProgress(assignment.row_number);
                                    return (
                                        <div key={assignment.id} className="p-4 border border-border-light rounded-2xl bg-surface-white shadow-sm">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="size-10 bg-text-main text-white rounded-xl flex items-center justify-center text-lg font-bold shadow-sm">
                                                        {assignment.row_number}
                                                    </span>
                                                    <div>
                                                        <span className="text-sm font-bold text-text-main capitalize block">
                                                            {assignment.side === 'north' ? t('assignModal.side.north') : assignment.side === 'south' ? t('assignModal.side.south') : t('tl.tasks.side_center')}
                                                        </span>
                                                        <span className="text-[10px] text-text-sub font-medium">
                                                            {t('tl.tasks.pickers_n', { n: assignment.assigned_pickers?.length || 0 })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-bold text-text-main">{Math.round(progress)}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-background-light rounded-full h-2.5 overflow-hidden">
                                                <div
                                                    className="bg-primary-vibrant h-full rounded-full transition-all duration-1000 ease-out dynamic-width"
                                                    style={{ '--w': `${progress}%` } as React.CSSProperties}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div {...buttonLike(() => setIsModalOpen(true))} className="text-center p-8 border-2 border-dashed border-border-light rounded-2xl bg-surface-white cursor-pointer hover:bg-slate-50 transition-colors group">
                                <span aria-hidden="true" className="material-symbols-outlined text-4xl text-text-sub mb-2 group-hover:scale-110 transition-transform">add_location_alt</span>
                                <p className="text-text-sub text-sm font-bold">{t('tl.tasks.no_rows')}</p>
                                <p className="text-xs text-primary-vibrant font-bold uppercase mt-1">{t('tl.tasks.tap_to_start')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <RowAssignmentModal
                    onClose={() => setIsModalOpen(false)}
                    onAssign={(row, side, pickers) => assignRow(row, side.toLowerCase() as 'north' | 'south', pickers)}
                    pickers={pickersForAssignment}
                />
            )}
        </div>
    );
};

export default TasksView;
