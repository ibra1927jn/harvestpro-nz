/**
 * TasksView — pestaña «Mapa» del team leader.
 *
 * Mapa táctico (el mismo OrchardMapView del manager: bloques → filas →
 * avatares) a pantalla completa, con las filas de MI equipo resaltadas y las
 * de otros equipos en gris con el nombre de su team leader. Debajo, el
 * recorrido de filas de mi equipo y las asignaciones activas de mi equipo
 * (las de los otros equipos solo se ven en el mapa).
 */
import { buttonLike } from '@/utils/pressable';
import React, { useState, useMemo } from 'react';
import RowHistory from '@/components/common/row-history/RowHistory';
import { useAuth } from '@/context/AuthContext';
import { useMessaging } from '../../../context/MessagingContext';
import { useHarvestStore as useHarvest } from '@/stores/useHarvestStore';
import RowAssignmentModal, { PickerForAssignment } from '../../modals/RowAssignmentModal';
import OrchardMapView from '../manager/OrchardMapView';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useTranslation } from '@/i18n';
import { selectTeamOf } from '@/services/harvestMetrics/roster';
import { selectTeamRowAssignments } from '@/services/harvestMetrics/rowTeams';

const TARGET_BUCKETS_PER_ROW = 60;

const TasksView = () => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const { rowAssignments, bucketRecords, assignRow, crew, settings } = useHarvest();
    const { broadcasts } = useMessaging();
    // Fila preseleccionada al abrir el modal desde el mapa (null = sin preselección)
    const [assignRowNumber, setAssignRowNumber] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Mi equipo (misma regla que Inicio y Equipo) y sus asignaciones de fila
    const team = useMemo(() => selectTeamOf(crew, appUser?.id), [crew, appUser?.id]);
    const teamAssignments = useMemo(
        () => selectTeamRowAssignments(rowAssignments ?? [], crew, appUser?.id),
        [rowAssignments, crew, appUser?.id],
    );

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

    // Solo mi equipo se puede asignar a filas (el team leader gestiona su equipo)
    const pickersForAssignment: PickerForAssignment[] = team.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        idNumber: p.picker_id,
        status: p.status === 'active' ? 'Active' : p.status === 'break' ? 'Break' : 'Off Duty'
    }));

    const openAssign = (rowNumber: number | null = null) => {
        setAssignRowNumber(rowNumber);
        setIsModalOpen(true);
    };

    return (
        <div className="flex flex-col bg-background-light pb-24">
            {/* MAPA TÁCTICO — a pantalla completa, la página hace scroll.
                OrchardMapView trae pt-14 (hueco para la barra de modos del manager,
                que aquí no existe): se compensa para no dejar un vacío bajo la cabecera. */}
            <ComponentErrorBoundary componentName="Tactical Map">
                <div className="-mt-10">
                <OrchardMapView
                    crew={crew}
                    bucketRecords={bucketRecords}
                    targetBucketsPerRow={settings?.min_buckets_per_hour ?? 30}
                    onRowClick={rowNum => openAssign(rowNum)}
                    highlightTeamLeaderId={appUser?.id}
                />
                </div>
            </ComponentErrorBoundary>

            {/* CONTENIDO */}
            <div className="px-4 space-y-5">
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

                {/* FILAS ACTIVAS — solo las de mi equipo */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-text-main text-lg flex items-center gap-2">
                            <span aria-hidden="true" className="material-symbols-outlined text-primary">format_list_bulleted</span>
                            {t('tl.tasks.active_rows')}
                        </h3>
                        <button
                            onClick={() => openAssign()}
                            className="text-primary-vibrant text-xs font-bold uppercase flex items-center gap-1 bg-white border border-border-light px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">add</span> {t('tl.tasks.assign')}
                        </button>
                    </div>

                    {teamAssignments.length > 0 ? (
                        <div className="space-y-3">
                            {teamAssignments.map((assignment) => {
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
                        <div {...buttonLike(() => openAssign())} className="text-center p-8 border-2 border-dashed border-border-light rounded-2xl bg-surface-white cursor-pointer hover:bg-slate-50 transition-colors group">
                            <span aria-hidden="true" className="material-symbols-outlined text-4xl text-text-sub mb-2 group-hover:scale-110 transition-transform">add_location_alt</span>
                            <p className="text-text-sub text-sm font-bold">{t('tl.tasks.no_rows')}</p>
                            <p className="text-xs text-primary-vibrant font-bold uppercase mt-1">{t('tl.tasks.tap_to_start')}</p>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <RowAssignmentModal
                    onClose={() => setIsModalOpen(false)}
                    onAssign={(row, side, pickers) => assignRow(row, side.toLowerCase() as 'north' | 'south', pickers)}
                    pickers={pickersForAssignment}
                    initialRow={assignRowNumber ?? undefined}
                />
            )}
        </div>
    );
};

export default TasksView;
