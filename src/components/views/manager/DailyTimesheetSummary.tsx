/**
 * DailyTimesheetSummary — hoja diaria completa (horas, cubetas, pago) para firmar.
 */
import type { DailyTimesheetRecord } from '@/services/payroll.service';
import { dailyTimesheetTotals } from './timesheet-utils';

interface DailyTimesheetSummaryProps {
  rows: DailyTimesheetRecord[];
  date: string;
}

export default function DailyTimesheetSummary({ rows, date }: DailyTimesheetSummaryProps) {
  const totals = dailyTimesheetTotals(rows);
  return (
    <div className="bg-white rounded-xl border border-border-light overflow-hidden">
      <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
        <h3 className="font-bold text-emerald-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">receipt_long</span>
          Daily Timesheet Summary — {date}
        </h3>
        <p className="text-xs text-emerald-600 mt-1">
          Hours worked, buckets scanned, quality grades, and earnings per picker
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2 text-text-sub font-semibold">Picker</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">Hours</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">Buckets</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">Rejected</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">Piece $</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold">Top-Up</th>
            <th className="text-right px-3 py-2 text-text-sub font-semibold font-bold">Total</th>
            <th className="text-center px-3 py-2 text-text-sub font-semibold">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(ts => (
            <tr key={ts.id} className={`border-t border-border-light ${ts.is_below_minimum ? 'bg-amber-50' : ''}`}>
              <td className="px-3 py-2 font-medium text-text-main">{ts.picker_name}</td>
              <td className="px-3 py-2 text-right font-mono">{ts.hours_worked}h</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{ts.buckets_total}</td>
              <td className="px-3 py-2 text-right font-mono text-red-500">{ts.buckets_rejected || '—'}</td>
              <td className="px-3 py-2 text-right font-mono">${ts.piece_earnings}</td>
              <td className="px-3 py-2 text-right font-mono text-amber-600">{ts.top_up > 0 ? `$${ts.top_up}` : '—'}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-text-main">${ts.total_earnings}</td>
              <td className="px-3 py-2 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  ts.pay_type === 'piece_rate'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {ts.pay_type === 'piece_rate' ? 'Piece' : 'Hourly+'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
          <tr>
            <td className="px-3 py-2 font-bold text-text-main">Totals</td>
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
              ${totals.piece.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-amber-600 font-bold">
              ${totals.topUp.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-lg text-text-main">
              ${totals.total.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-center text-xs text-text-muted">
              {totals.belowMinimum} below min
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
