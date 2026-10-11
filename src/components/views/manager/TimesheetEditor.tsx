/**
 * Timesheet Editor
 *
 * Admin-only view for correcting past attendance records.
 * Shows daily attendance with inline editing of check-in/out times.
 * All corrections require a reason and create an audit trail.
 */

import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import { useState, useEffect, useCallback } from 'react';

import { attendanceService } from '@/services/attendance.service';
import { payrollService, DailyTimesheetRecord } from '@/services/payroll.service';
import { todayNZST } from '@/utils/nzst';
import { useAuth } from '@/context/AuthContext';
import {
  AttendanceRow,
  formatTimeForInput,
  formatTime,
  calculateHours,
  nzTimeToIso,
  isAbnormal,
} from './timesheet-utils';

interface TimesheetEditorProps {
  orchardId: string;
}

export default function TimesheetEditor({ orchardId }: TimesheetEditorProps) {
  const { appUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayNZST());
  // Timesheet completo con produccion y earnings (generado bajo demanda)
  const [dailyTimesheet, setDailyTimesheet] = useState<DailyTimesheetRecord[]>([]);
  const [generatingTimesheet, setGeneratingTimesheet] = useState(false);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ checkIn: '', checkOut: '', breakStart: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const { showToast } = useToast();
  // ========================================
  // DATA LOADING
  // ========================================

  const loadRecords = useCallback(async () => {
    if (!orchardId) return;
    setLoading(true);
    try {
      const data = await attendanceService.getAttendanceByDate(orchardId, selectedDate);
      // Los fichajes borrados no se muestran ni cuentan
      setRecords((data as AttendanceRow[]).filter(r => !r.deleted_at));
    } catch (err) {
      logger.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [orchardId, selectedDate]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // ========================================
  // EDITING
  // ========================================

  const startEdit = (record: AttendanceRow) => {
    setEditingId(record.id);
    setEditValues({
      checkIn: record.check_in ? formatTimeForInput(record.check_in) : '',
      checkOut: record.check_out ? formatTimeForInput(record.check_out) : '',
      breakStart: record.break_start ? formatTimeForInput(record.break_start) : '',
      reason: '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ checkIn: '', checkOut: '', breakStart: '', reason: '' });
  };

  const saveCorrection = async (record: AttendanceRow) => {
    if (!editValues.reason.trim()) {
      showToast('A correction reason is required for audit compliance.', 'warning');
      return;
    }

    if (!appUser?.id) return;

    setSaving(true);
    try {
      // Horas NZ de ese día → instante UTC (desfase correcto en verano e invierno)
      const updates: { check_in?: string; check_out?: string; break_start?: string | null } = {};

      if (editValues.checkIn) {
        updates.check_in = nzTimeToIso(record.date, editValues.checkIn);
      }
      if (editValues.checkOut) {
        updates.check_out = nzTimeToIso(record.date, editValues.checkOut);
      }
      const previousBreak = record.break_start ? formatTimeForInput(record.break_start) : '';
      if (editValues.breakStart !== previousBreak) {
        updates.break_start = editValues.breakStart ? nzTimeToIso(record.date, editValues.breakStart) : null;
      }

      await attendanceService.correctAttendance(
        record.id,
        updates,
        editValues.reason.trim(),
        appUser.id
      );

      setEditingId(null);
      setSuccessMsg(`Corrected ${record.picker?.name || 'picker'}'s timesheet`);
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadRecords();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-xl text-amber-600">schedule</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-main">Timesheet Editor</h2>
            <p className="text-sm text-text-muted">Correct attendance records with audit trail</p>
          </div>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-text-muted">
            calendar_today
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayNZST()}
            title="Select date"
            className="px-3 py-2 border border-border-light rounded-xl text-sm font-medium text-text-sub bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <span className="material-symbols-outlined text-lg text-green-600">check_circle</span>
          <span className="text-sm font-medium text-green-700">{successMsg}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl text-text-muted animate-spin">
            progress_activity
          </span>
        </div>
      )}

      {/* Empty State */}
      {!loading && records.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-border-light">
          <span className="material-symbols-outlined text-5xl mx-auto text-slate-300 mb-4">
            schedule
          </span>
          <p className="text-text-muted font-medium">No attendance records for {selectedDate}</p>
          <p className="text-sm text-text-muted mt-1">Select a different date to view records</p>
        </div>
      )}

      {/* Table */}
      {!loading && records.length > 0 && (
        <div className="bg-white rounded-xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">Picker</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">Check-In</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">Check-Out</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold" title="30-min unpaid meal break">Break</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold" title="Paid hours (unpaid break deducted)">Hours</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">Status</th>
                <th className="text-right px-4 py-3 text-text-sub font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => {
                const hours = calculateHours(record);
                const unclosed = !!record.check_in && !record.check_out && record.date < todayNZST();
                const abnormal = isAbnormal(hours);
                const isEditing = editingId === record.id;

                return (
                  <tr
                    key={record.id}
                    className={`border-t border-border-light ${abnormal ? 'bg-red-50' : ''} ${isEditing ? 'bg-amber-50' : ''}`}
                  >
                    {/* Picker Name */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-main">
                        {record.picker?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-text-muted">{record.picker?.picker_id}</div>
                    </td>

                    {/* Check-In */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="time"
                          value={editValues.checkIn}
                          onChange={e => setEditValues(v => ({ ...v, checkIn: e.target.value }))}
                          title="Check-in time"
                          className="px-2 py-1 border border-amber-300 rounded-lg text-sm w-24 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      ) : (
                        <span className="font-mono">{formatTime(record.check_in)}</span>
                      )}
                    </td>

                    {/* Check-Out */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="time"
                          value={editValues.checkOut}
                          onChange={e => setEditValues(v => ({ ...v, checkOut: e.target.value }))}
                          title="Check-out time"
                          className="px-2 py-1 border border-amber-300 rounded-lg text-sm w-24 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      ) : (
                        <span
                          className={`font-mono ${!record.check_out ? 'text-red-500' : ''}`}
                        >
                          {!record.check_out && (
                            <span className="material-symbols-outlined text-sm inline mr-1 text-red-500">
                              warning
                            </span>
                          )}
                          {formatTime(record.check_out)}
                        </span>
                      )}
                    </td>

                    {/* Break (descanso de 30 min no pagado, lo anota el team leader) */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="time"
                          value={editValues.breakStart}
                          onChange={e => setEditValues(v => ({ ...v, breakStart: e.target.value }))}
                          title="Break start time"
                          className="px-2 py-1 border border-amber-300 rounded-lg text-sm w-24 focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      ) : record.break_start ? (
                        <span className="font-mono">{formatTime(record.break_start)}</span>
                      ) : (
                        <span className="text-xs text-text-muted" title="Not recorded: 30 min deducted on shifts over 4 h">auto</span>
                      )}
                    </td>

                    {/* Hours */}
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono font-bold ${abnormal || unclosed ? 'text-red-600' : 'text-text-sub'}`}
                        title={unclosed ? 'Shift not closed — add the check-out time' : undefined}
                      >
                        {hours !== null ? `${hours}h` : unclosed ? 'Not closed' : '—'}
                      </span>
                      {abnormal && (
                        <span className="material-symbols-outlined text-sm inline ml-1 text-red-500">
                          warning
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {record.corrected_at ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <span className="material-symbols-outlined text-xs">edit</span>
                          Corrected
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">{record.status}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Reason for correction *"
                            value={editValues.reason}
                            onChange={e => setEditValues(v => ({ ...v, reason: e.target.value }))}
                            className="w-full px-2 py-1 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-text-muted hover:text-text-sub rounded-lg"
                              aria-label="Cancel edit"
                              disabled={saving}
                            >
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                            <button
                              onClick={() => saveCorrection(record)}
                              disabled={saving || !editValues.reason.trim()}
                              className="p-1.5 text-green-600 hover:text-green-700 rounded-lg disabled:opacity-50"
                              aria-label="Save correction"
                            >
                              {saving ? (
                                <span className="material-symbols-outlined text-base animate-spin">
                                  progress_activity
                                </span>
                              ) : (
                                <span className="material-symbols-outlined text-base">save</span>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(record)}
                          className="p-2 text-text-muted hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          aria-label={`Edit ${record.picker?.name}'s timesheet`}
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Boton para generar timesheet completo con produccion */}
      {!loading && records.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              setGeneratingTimesheet(true);
              try {
                const data = await payrollService.generateDailyTimesheet(orchardId, selectedDate);
                setDailyTimesheet(data);
              } catch (err) {
                logger.error('[Timesheet] Failed to generate daily timesheet:', err);
                showToast('Failed to generate timesheet summary', 'error');
              } finally {
                setGeneratingTimesheet(false);
              }
            }}
            disabled={generatingTimesheet}
            className="bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {generatingTimesheet ? (
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-lg">summarize</span>
            )}
            Generate Complete Timesheet
          </button>
        </div>
      )}

      {/* Timesheet completo con produccion y earnings */}
      {dailyTimesheet.length > 0 && (
        <div className="bg-white rounded-xl border border-border-light overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
            <h3 className="font-bold text-emerald-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">receipt_long</span>
              Daily Timesheet Summary — {selectedDate}
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
              {dailyTimesheet.map(ts => (
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
                  {dailyTimesheet.reduce((s, t) => s + t.hours_worked, 0).toFixed(1)}h
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {dailyTimesheet.reduce((s, t) => s + t.buckets_total, 0)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-red-500">
                  {dailyTimesheet.reduce((s, t) => s + t.buckets_rejected, 0) || '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  ${dailyTimesheet.reduce((s, t) => s + t.piece_earnings, 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-amber-600 font-bold">
                  ${dailyTimesheet.reduce((s, t) => s + t.top_up, 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-lg text-text-main">
                  ${dailyTimesheet.reduce((s, t) => s + t.total_earnings, 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-center text-xs text-text-muted">
                  {dailyTimesheet.filter(t => t.is_below_minimum).length} below min
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-lg text-amber-600 mt-0.5">warning</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Audit Compliance</p>
            <p className="text-xs text-amber-700 mt-1">
              All corrections are logged with your name, timestamp, and reason. This data is
              immutable and visible in the Audit Log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
