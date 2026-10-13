/**
 * DailyTimesheetSummary — hoja diaria completa (horas, cubetas, pago) para firmar.
 */
import type { DailyTimesheetRecord } from '@/services/payroll.service';
import { dailyTimesheetTotals } from './timesheet-utils';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate } from '@/utils/nzFormat';

interface DailyTimesheetSummaryProps {
  rows: DailyTimesheetRecord[];
  date: string;
}

export default function DailyTimesheetSummary({ rows, date }: DailyTimesheetSummaryProps) {
  const totals = dailyTimesheetTotals(rows);
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-xl border border-border-light overflow-hidden">
      <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
        <h3 className="font-bold text-emerald-800 flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-lg">receipt_long</span>
          {t('tse.daily_title', { date: formatNZDate(date, 'medium') })}
        </h3>
        <p className="text-xs text-emerald-600 mt-1">
          {t('tse.daily_subtitle')}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2 text-text-sub font-semibold">{t('roles.picker')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">{t('pay.col.hours')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">{t('pay.col.buckets')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">{t('status.rejected')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">{t('tse.piece_money')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">{t('mgr.top_up')}</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold font-bold">{t('hr.pay.total')}</th>
            <th className="text-center px-3 py-2 text-text-sub font-semibold">{t('hr.type')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(ts => (
            <tr key={ts.id} className={`border-t border-border-light ${ts.is_below_minimum ? 'bg-amber-50' : ''}`}>
              <td className="px-3 py-2 font-medium text-text-main">{ts.picker_name}</td>
              <td className="px-3 py-2 text-right font-mono">{ts.hours_worked}h</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{ts.buckets_total}</td>
              <td className="px-3 py-2 text-right font-mono text-red-500">{ts.buckets_rejected || '—'}</td>
              <td className="px-3 py-2 text-right font-mono">{formatNZD(ts.piece_earnings)}</td>
              <td className="px-3 py-2 text-right font-mono text-amber-600">{ts.top_up > 0 ? formatNZD(ts.top_up) : '—'}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-text-main">{formatNZD(ts.total_earnings)}</td>
              <td className="px-3 py-2 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  ts.pay_type === 'piece_rate'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {ts.pay_type === 'piece_rate' ? t('tse.type_piece') : t('tse.type_hourly')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
          <tr>
            <td className="px-3 py-2 font-bold text-text-main">{t('tse.totals')}</td>
            <td className="px-3 py-2 text-right font-mono font-bold">
              {totals.hours.toFixed(1)}h
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold">
              {totals.buckets}
            </td>
            <td className="px-3 py-2 text-right font-mono text-red-500">
              {totals.rejected || '—'}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold">
              {formatNZD(totals.piece)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-amber-600 font-bold">
              {formatNZD(totals.topUp)}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-lg text-text-main">
              {formatNZD(totals.total)}
            </td>
            <td className="px-3 py-2 text-center text-xs text-text-muted">
              {t('tse.below_min', { n: totals.belowMinimum })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
