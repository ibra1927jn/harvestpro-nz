/**
 * GoalProgress — Meta del día con hora estimada al ritmo actual
 *
 * No hay hora de fin de turno (cada equipo y runner termina cuando termina,
 * decisión del dueño 2026-10-21): no se proyecta «a fin de día» ni se da un
 * semáforo adelantado/atrasado. Se enseña el avance, «a este ritmo la meta
 * se alcanza a las HH:MM», el ritmo y lo que falta.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { formatNZNumber } from '@/utils/nzFormat';

interface GoalProgressProps {
    progress: number;
    currentTons: number;
    targetTons: number;
    eta: string;
    etaStatus: 'complete' | 'no_data' | 'projected';
    /** Cubetas por hora (ritmo de las últimas 2 h) */
    velocity?: number;
    totalBuckets?: number;
    hoursElapsed?: number;
}

const GoalProgress: React.FC<GoalProgressProps> = ({
    progress,
    currentTons,
    targetTons,
    eta,
    etaStatus,
    velocity = 0,
    totalBuckets = 0,
    hoursElapsed = 0,
}) => {
    const { t } = useTranslation();
    // Animated progress bar — fills from 0 on mount
    const [barWidth, setBarWidth] = useState(0);

    useEffect(() => {
        const timeout = setTimeout(() => setBarWidth(progress), 300);
        return () => clearTimeout(timeout);
    }, [progress]);

    const targetBuckets = Math.round(targetTons * 72); // ~72 cubetas por tonelada
    const remainingBuckets = Math.max(0, targetBuckets - totalBuckets);

    return (
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-6 !rounded-3xl shadow-xl relative overflow-hidden dash-card-enter">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-400 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
            <div className="relative z-10 flex justify-between items-end mb-4">
                <div>
                    <p className="text-white/80 text-xs font-bold uppercase mb-1">{t('dashboard.daily_target')}</p>
                    <h3 className="text-3xl font-black">
                        {progress.toFixed(0)}% <span className="text-lg text-indigo-200 font-medium">{t('dashboard.complete')}</span>
                    </h3>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold">{currentTons.toFixed(1)} / {targetTons} t</p>
                    <div className={`flex items-center gap-1 mt-1 text-sm font-bold ${etaStatus === 'complete' ? 'text-green-300' :
                        etaStatus === 'projected' ? 'text-indigo-100' : 'text-white/60'
                        }`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">
                            {etaStatus === 'complete' ? 'check_circle' :
                                etaStatus === 'projected' ? 'schedule' : 'hourglass_empty'}
                        </span>
                        <span>{etaStatus === 'projected' ? t('dashboard.eta_at_pace', { time: eta }) : eta}</span>
                    </div>
                </div>
            </div>
            {/* Animated Progress Bar */}
            <div className="h-4 bg-white/20 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full relative transition-all duration-1000 ease-out dynamic-width shadow-sm"
                    style={{ '--w': `${barWidth}%` } as React.CSSProperties}
                >
                    {/* Shimmer sobre el fill coral/naranja */}
                    {barWidth > 0 && (
                        <div className="absolute inset-0 overflow-hidden rounded-full">
                        </div>
                    )}
                </div>
            </div>

            {/* Ritmo y lo que falta — sin proyección a una hora de fin que no existe */}
            {hoursElapsed > 0.5 && etaStatus !== 'complete' && (
                <div className="relative z-10 mt-4 pt-3 border-t border-white/20 flex justify-between items-center text-sm animate-fade-in anim-delay" style={{ '--delay': '0.5s', animationFillMode: 'both' } as React.CSSProperties}>
                    <span className="text-white/80">{t('dashboard.pace_now', { n: formatNZNumber(Math.round(velocity)) })}</span>
                    <span className="font-bold text-indigo-100">
                        {t('dashboard.remaining_to_goal', { n: formatNZNumber(remainingBuckets) })}
                    </span>
                </div>
            )}
        </div>
    );
};

export default GoalProgress;
