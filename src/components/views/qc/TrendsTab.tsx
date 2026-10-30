/**
 * TrendsTab — QC Quality Trends over time
 * Grade distribution over past 7 days + per-picker quality scores
 */
import React, { useState, useEffect, useMemo } from 'react';
import { qcService, GradeDistribution } from '@/services/qc.service';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useTranslation } from '@/i18n';
import { addDaysYMD, todayNZST } from '@/utils/nzst';
import { formatNZDate } from '@/utils/nzFormat';
import { gradeLabel } from './gradeLabel';

interface TrendsTabProps {
  orchardId: string;
}

interface DayData {
  date: string;
  label: string;
  distribution: GradeDistribution;
}

const TrendsTab: React.FC<TrendsTabProps> = ({ orchardId }) => {
  const { t } = useTranslation();
  const [days, setDays] = useState<DayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!orchardId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const results: DayData[] = [];
      // Días de NZ (antes: fecha UTC → por la mañana en NZ "hoy" era ayer)
      const today = todayNZST();
      for (let i = 6; i >= 0; i--) {
        const dateStr = addDaysYMD(today, -i);
        const dist = await qcService.getGradeDistribution(orchardId, dateStr);
        results.push({
          date: dateStr,
          label: formatNZDate(dateStr, 'weekdayDay'),
          distribution: dist,
        });
      }
      setDays(results);
      setIsLoading(false);
    };
    load();
  }, [orchardId]);

  // Per-picker quality across all 7 days
  const [pickerScores, setPickerScores] = useState<
    { name: string; total: number; aCount: number; rejectCount: number }[]
  >([]);

  useEffect(() => {
    const loadPickerData = async () => {
      if (!orchardId) return;
      const today = todayNZST();
      const inspections = await qcService.getInspections(orchardId, today);
      const map = new Map<
        string,
        { name: string; total: number; aCount: number; rejectCount: number }
      >();
      inspections.forEach(insp => {
        const existing = map.get(insp.picker_id) || {
          name: insp.picker_name || insp.picker_id.slice(0, 8),
          total: 0,
          aCount: 0,
          rejectCount: 0,
        };
        existing.total++;
        if (insp.grade === 'A') existing.aCount++;
        if (insp.grade === 'reject') existing.rejectCount++;
        map.set(insp.picker_id, existing);
      });
      setPickerScores(
        Array.from(map.values()).sort((a, b) => {
          const aPct = a.total > 0 ? a.aCount / a.total : 0;
          const bPct = b.total > 0 ? b.aCount / b.total : 0;
          return bPct - aPct;
        })
      );
    };
    loadPickerData();
  }, [orchardId]);

  // Overall rejection rate trend
  const rejectionTrend = useMemo(
    () =>
      days.map(d => ({
        label: d.label,
        rate: d.distribution.total > 0 ? (d.distribution.reject / d.distribution.total) * 100 : 0,
      })),
    [days]
  );

  const maxRate = Math.max(...rejectionTrend.map(r => r.rate), 1);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton type="card" count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 7-Day Grade Distribution */}
      <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-indigo-500 text-base">trending_up</span>
          {t('qc.trend_7d')}
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {days.map(day => (
            <div key={day.date} className="text-center">
              <div className="h-28 flex flex-col items-center justify-end gap-0.5 mb-2">
                {day.distribution.total === 0 ? (
                  <div className="text-xs text-text-disabled">—</div>
                ) : (
                  <>
                    {[
                      { key: 'A', count: day.distribution.A, color: 'bg-green-500' },
                      { key: 'B', count: day.distribution.B, color: 'bg-blue-500' },
                      { key: 'C', count: day.distribution.C, color: 'bg-amber-500' },
                      { key: 'reject', count: day.distribution.reject, color: 'bg-red-500' },
                    ]
                      .filter(s => s.count > 0)
                      .map(seg => (
                        <div
                          key={seg.key}
                          className={`w-full rounded-sm ${seg.color} transition-all`}
                          style={{
                            height: `${(seg.count / day.distribution.total) * 100}%`,
                            minHeight: '2px',
                          }}
                          title={`${seg.key}: ${seg.count} (${Math.round((seg.count / day.distribution.total) * 100)}%)`}
                        />
                      ))}
                  </>
                )}
              </div>
              <p className="text-[10px] font-medium text-text-secondary">{day.label}</p>
              <p className="text-[10px] text-text-muted">{day.distribution.total}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 justify-center">
          {[
            { label: gradeLabel(t, 'A'), color: 'bg-green-500' },
            { label: gradeLabel(t, 'B'), color: 'bg-blue-500' },
            { label: gradeLabel(t, 'C'), color: 'bg-amber-500' },
            { label: gradeLabel(t, 'reject'), color: 'bg-red-500' },
          ].map(legend => (
            <div key={legend.label} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-sm ${legend.color}`} />
              <span className="text-[10px] text-text-secondary">{legend.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rejection Rate Trend */}
      <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">{t('qc.rejection_trend')}</h3>
        <div className="flex items-end gap-2 h-20">
          {rejectionTrend.map(point => (
            <div key={point.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-red-500">{point.rate.toFixed(0)}%</span>
              <div
                className="w-full bg-surface-secondary rounded-t-sm relative"
                style={{ height: '48px' }}
              >
                <div
                  className="absolute bottom-0 w-full bg-gradient-to-t from-red-500 to-red-400 rounded-t-sm transition-all"
                  style={{
                    height: `${(point.rate / maxRate) * 100}%`,
                    minHeight: point.rate > 0 ? '2px' : '0px',
                  }}
                />
              </div>
              <span className="text-[9px] text-text-muted">{point.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Picker Quality Scores */}
      <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          {t('qc.picker_scores')}
        </h3>
        {pickerScores.length === 0 ? (
          <p className="text-center text-text-muted py-3 text-sm">{t('qc.no_data_today')}</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pickerScores.map((picker, i) => {
              const aPct = picker.total > 0 ? Math.round((picker.aCount / picker.total) * 100) : 0;
              const rejPct =
                picker.total > 0 ? Math.round((picker.rejectCount / picker.total) * 100) : 0;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 py-1.5 border-b border-border-light last:border-0"
                >
                  <span className="text-xs font-bold text-text-muted w-4">{i + 1}</span>
                  <span className="text-sm font-medium text-text-primary flex-1">
                    {picker.name}
                  </span>
                  <span className="text-xs text-green-600 font-bold" title={gradeLabel(t, 'A')}>{aPct}% A</span>
                  {rejPct > 0 && (
                    <span className="text-xs text-red-500 font-bold" title={gradeLabel(t, 'reject')}>{rejPct}% ✗</span>
                  )}
                  <span className="text-xs text-text-muted">{t('qc.inspected_n', { n: picker.total })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrendsTab;
