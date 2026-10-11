/**
 * LogisticsEventFeed — Feed de eventos recientes de la operación logística.
 * Muestra las últimas 5 entradas con icono y hora relativa.
 */
import React from 'react';
import { useTranslation } from '@/i18n';

interface LogisticsEventFeedProps {
  events: Array<{
    id: string;
    type: 'pickup_requested' | 'row_blocked' | 'alert';
    label: string;
    at: string;
  }>;
}

const EVENT_ICONS: Record<LogisticsEventFeedProps['events'][number]['type'], string> = {
  pickup_requested: 'local_shipping',
  row_blocked: 'block',
  alert: 'notification_important',
};

const EVENT_COLORS: Record<LogisticsEventFeedProps['events'][number]['type'], string> = {
  pickup_requested: 'text-indigo-500',
  row_blocked: 'text-amber-500',
  alert: 'text-red-500',
};

function formatTime(at: string): string {
  try {
    return new Date(at).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const LogisticsEventFeed: React.FC<LogisticsEventFeedProps> = ({ events }) => {
  const { t } = useTranslation();

  // Slice defensivo: hook ya limita a 5, pero garantizamos aquí también
  const visible = events.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <p className="text-sm font-bold text-slate-700 mb-3">{t('logistics.events.title')}</p>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">{t('logistics.events.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map(event => (
            <li key={event.id} className="flex items-center gap-3 py-2.5">
              {/* Icono de tipo */}
              <span
                className={`material-symbols-outlined text-xl flex-shrink-0 ${EVENT_COLORS[event.type]}`}
              >
                {EVENT_ICONS[event.type]}
              </span>

              {/* Descripción */}
              <span className="flex-1 text-xs text-slate-700 truncate">
                {t(`logistics.events.${event.type}`)} — {event.label}
              </span>

              {/* Hora */}
              <span className="text-[10px] text-slate-400 flex-shrink-0">{formatTime(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LogisticsEventFeed;
