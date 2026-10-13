/**
 * BinBacklogChart — Gráfico de barras SVG con bins pendientes de pickup por hora.
 * Sin interactividad ni tooltips — lectura rápida del backlog en turno.
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { formatHourLabel } from '@/utils/time';

interface BinBacklogChartProps {
  series: Array<{ hour: number; pending: number }>;
  shiftStart?: string;
  shiftEnd?: string;
}

const BAR_FILL = '#6366f1'; // indigo-500
const SVG_HEIGHT = 120;
const BAR_GAP = 4;

const BinBacklogChart: React.FC<BinBacklogChartProps> = ({ series }) => {
  const { t } = useTranslation();

  if (series.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <p className="text-sm font-bold text-slate-700 mb-0.5">{t('logistics.backlog.title')}</p>
        <p className="text-xs text-slate-400 mb-4">{t('logistics.backlog.subtitle')}</p>
        <div className="h-[120px] flex flex-col items-center justify-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-3xl text-slate-300">inventory_2</span>
          <p className="text-xs text-slate-400">{t('logistics.backlog.empty')}</p>
        </div>
      </div>
    );
  }

  const maxPending = Math.max(...series.map(p => p.pending), 1);
  // Ancho de cada barra en % del SVG viewBox (viewBox="0 0 100 100")
  const barWidth = (100 / series.length) - BAR_GAP / series.length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <p className="text-sm font-bold text-slate-700 mb-0.5">{t('logistics.backlog.title')}</p>
      <p className="text-xs text-slate-400 mb-3">{t('logistics.backlog.subtitle')}</p>

      {/* Eje Y: referencia máximo */}
      <div className="flex items-start gap-2">
        <div className="flex flex-col justify-between h-[120px] text-[9px] text-slate-400 text-right w-5 flex-shrink-0">
          <span>{maxPending}</span>
          <span>0</span>
        </div>

        {/* SVG bars */}
        <div className="flex-1 relative">
          <svg
            viewBox={`0 0 100 100`}
            preserveAspectRatio="none"
            height={SVG_HEIGHT}
            width="100%"
            aria-label={t('logistics.backlog.title')}
            role="img"
          >
            {series.map((point, idx) => {
              const barH = maxPending > 0 ? (point.pending / maxPending) * 90 : 0;
              const x = idx * (100 / series.length) + BAR_GAP / 2;
              const y = 100 - barH;
              return (
                <rect
                  key={point.hour}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={BAR_FILL}
                  rx="1"
                />
              );
            })}
          </svg>

          {/* Eje X: etiquetas de hora */}
          <div className="flex mt-1">
            {series.map(point => (
              <div
                key={point.hour}
                className="flex-1 text-center text-[9px] text-slate-400"
              >
                {formatHourLabel(point.hour)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BinBacklogChart;
