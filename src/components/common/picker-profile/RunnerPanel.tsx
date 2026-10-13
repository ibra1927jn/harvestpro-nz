/**
 * RunnerPanel — Ruta y trips para Bucket Runners
 * Extraído de PickerProfileDrawer.tsx
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { Picker } from '@/types';

// Determina la ruta/bloque según la fila actual del runner
function getRouteLabel(row: number): string {
    if (row <= 20) return 'Block A → Bin Station 1';
    if (row <= 40) return 'Block B → Bin Station 2';
    return 'Block C → Bin Station 3';
}

interface RunnerPanelProps {
    member: Picker;
    crew: Picker[];
}

const RunnerPanel: React.FC<RunnerPanelProps> = ({ member, crew }) => {
    const { t } = useTranslation();

    const effectiveHours = member.check_in
        ? Math.max(0, (Date.now() - new Date(member.check_in).getTime()) / 3600000)
        : 0;

    const teamLeaderName = member.team_leader_id
        ? (crew.find(c => c.id === member.team_leader_id)?.name || 'Assigned')
        : t('panel.runner.unassigned');

    return (
        <div className="space-y-4">
            {/* Stats de actividad */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-amber-700">{member.total_buckets_today ?? 0}</p>
                    <p className="text-[10px] text-amber-600 font-bold">{t('panel.runner.trips')}</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-sky-700">{effectiveHours > 0 ? effectiveHours.toFixed(1) : '0'}h</p>
                    <p className="text-[10px] text-sky-600 font-bold">{t('panel.runner.hours')}</p>
                </div>
            </div>

            {/* Ruta y equipo */}
            <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t('panel.runner.route_title')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-lg p-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.runner.current_route')}</p>
                        <p className="text-xs font-bold text-slate-900">
                            {member.current_row ? getRouteLabel(member.current_row) : t('panel.runner.not_assigned')}
                        </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.runner.assigned_team')}</p>
                        <p className="text-xs font-bold text-slate-900">{teamLeaderName}</p>
                    </div>
                </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">chat</span>
                    {t('panel.runner.message_tl')}
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">check_circle</span>
                    {t('panel.runner.complete_route')}
                </button>
            </div>
        </div>
    );
};

export default RunnerPanel;
