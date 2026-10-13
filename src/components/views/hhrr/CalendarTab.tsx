/**
 * CalendarTab.tsx — HR Calendar & Scheduling
 *
 * Today's schedule ahora se deriva de harvest_settings.shift_start_time /
 * shift_end_time (useOrchardSchedule). Rest breaks cada 2h + meal break
 * a las 4h según Employment Relations Act 2000.
 *
 * Upcoming Leave sigue placeholder — la tabla leave_requests no existe
 * aún (deuda técnica anotada en PROGRESS.md).
 */
import React from 'react';
import { useOrchardSchedule, type ScheduleEntry } from '@/hooks/useOrchardSchedule';
import { NZ_REST_BREAK_DURATION_MINUTES, NZ_MEAL_BREAK_DURATION_MINUTES } from '@/constants/nz-law';
import type { TFunction } from '@/i18n';
import { useTranslation } from '@/i18n';

/** Texto de cada tramo del horario en el idioma de la app */
function scheduleText(t: TFunction, kind: ScheduleEntry['kind']): string {
    switch (kind) {
        case 'shift_start': return t('hr.cal.shift_start');
        case 'rest': return t('hr.cal.rest_break', { min: NZ_REST_BREAK_DURATION_MINUTES });
        case 'meal': return t('hr.cal.meal_break', { min: NZ_MEAL_BREAK_DURATION_MINUTES });
        case 'shift_end': return t('hr.cal.shift_end');
    }
}


const CalendarTab: React.FC = () => {
    const { t } = useTranslation();
    const { schedule, isFallback } = useOrchardSchedule();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Preview Banner */}
            {isFallback && (
                <div
                    data-testid="calendar-fallback-banner"
                    className="lg:col-span-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-amber-600">construction</span>
                    <p className="text-sm font-medium text-amber-800">
                        {t('hr.cal.fallback')}
                    </p>
                </div>
            )}

            {/* Today's Schedule — derivado de harvest_settings */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
                <h3 className="font-bold text-text-primary mb-4">{t('hr.cal.today')}</h3>
                {schedule.length === 0 ? (
                    <p className="text-sm text-text-muted">
                        {t('hr.cal.no_schedule')}
                    </p>
                ) : (
                    <div data-testid="calendar-schedule" className="space-y-1">
                        {schedule.map((item, i) => (
                            <div
                                key={`${item.kind}-${item.time}-${i}`}
                                data-testid={`schedule-${item.kind}`}
                                className="flex items-center gap-3 py-2.5 border-b border-border-light last:border-0"
                            >
                                <span className="text-xs font-mono text-text-muted w-12">{item.time}</span>
                                <span aria-hidden="true" className={`material-symbols-outlined text-lg ${item.color}`}>{item.icon}</span>
                                <span className="text-sm text-text-primary font-medium">{scheduleText(t, item.kind)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Vacaciones: aún no se registran en la app (antes salían nombres de ejemplo) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
                <h3 className="font-bold text-text-primary mb-2">{t('hr.cal.leave')}</h3>
                <p className="text-sm text-text-secondary">
                    {t('hr.cal.leave_none')}
                </p>
            </div>
        </div>
    );
};

export default CalendarTab;
