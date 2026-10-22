/**
 * Timesheet Editor
 *
 * Manager / team leader view for correcting past attendance records.
 * Shows daily attendance with inline editing of check-in/out times and a
 * multi-select to apply the same correction to several timesheets at once.
 * All corrections require a reason and create an audit trail.
 *
 * `pickerIds` (team leader): only those people's timesheets are loaded and
 * shown. Without it (manager) the whole orchard is shown.
 */

import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { attendanceService } from '@/services/attendance.service';
import { payrollService, DailyTimesheetRecord } from '@/services/payroll.service';
import { todayNZST } from '@/utils/nzst';
import { useAuth } from '@/context/AuthContext';
import {
  AttendanceRow,
  CorrectionForm,
  EMPTY_CORRECTION,
  buildBatchItems,
  buildCorrectionUpdates,
  correctionFormFor,
  isFlagged,
  isMealBreakMissing,
} from './timesheet-utils';
import TimesheetRow from './TimesheetRow';
import TimesheetBatchPanel from './TimesheetBatchPanel';
import DailyTimesheetSummary from './DailyTimesheetSummary';
import { formatNZDate } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

interface TimesheetEditorProps {
  orchardId: string;
  /** Solo los fichajes de estas personas (el team leader ve y corrige su equipo) */
  pickerIds?: string[];
}

export default function TimesheetEditor({ orchardId, pickerIds }: TimesheetEditorProps) {
  const { t } = useTranslation();
  const { appUser } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [selectedDate, setSelectedDate] = useState(todayNZST());
  // Timesheet completo con produccion y earnings (generado bajo demanda)
  const [dailyTimesheet, setDailyTimesheet] = useState<DailyTimesheetRecord[]>([]);
  const [generatingTimesheet, setGeneratingTimesheet] = useState(false);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CorrectionForm>(EMPTY_CORRECTION);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  // Selección múltiple y formulario del lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchValues, setBatchValues] = useState<CorrectionForm>(EMPTY_CORRECTION);
  const [batchSaving, setBatchSaving] = useState(false);
  const { showToast } = useToast();
  const breaksMissing = records.filter(r => isMealBreakMissing(r)).length;
  const flaggedCount = records.filter(r => isFlagged(r)).length;
  const selectedRecords = records.filter(r => selectedIds.has(r.id));
  const allSelected = records.length > 0 && selectedRecords.length === records.length;

  // Alcance: clave estable para no recargar si el padre pasa un array nuevo cada render
  const pickerKey = pickerIds ? pickerIds.join(',') : null;
  const pickerSet = useMemo(
    () => (pickerKey === null ? null : new Set(pickerKey ? pickerKey.split(',') : [])),
    [pickerKey],
  );
  // ========================================
  // DATA LOADING
  // ========================================

  const loadRecords = useCallback(async () => {
    if (!orchardId) return;
    setLoading(true);
    try {
      const data = await attendanceService.getAttendanceByDate(orchardId, selectedDate);
      // Los fichajes borrados no se muestran ni cuentan; con pickerIds, solo esas personas
      const rows = (data as AttendanceRow[])
        .filter(r => !r.deleted_at)
        .filter(r => !pickerSet || pickerSet.has(r.picker_id));
      setRecords(rows);
      // La selección no sobrevive a una recarga con filas distintas
      setSelectedIds(prev => {
        const ids = new Set(rows.map(r => r.id));
        return new Set([...prev].filter(id => ids.has(id)));
      });
    } catch (err) {
      logger.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [orchardId, selectedDate, pickerSet]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // ========================================
  // SELECCIÓN MÚLTIPLE / LOTE
  // ========================================

  const toggleSelect = (record: AttendanceRow) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(record.id)) next.delete(record.id);
      else next.add(record.id);
      return next;
    });
  };

  const selectAll = (on: boolean) => {
    setSelectedIds(on ? new Set(records.map(r => r.id)) : new Set());
  };

  const selectFlagged = () => {
    setSelectedIds(new Set(records.filter(r => isFlagged(r)).map(r => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBatchValues(EMPTY_CORRECTION);
  };

  const applyBatch = async () => {
    if (!appUser?.id || selectedRecords.length === 0) return;
    if (!batchValues.reason.trim()) {
      showToast(t('tse.reason_required'), 'warning');
      return;
    }
    const items = buildBatchItems(selectedRecords, batchValues);
    setBatchSaving(true);
    try {
      const result = await attendanceService.correctAttendanceBatch(items, batchValues.reason.trim(), appUser.id);
      if (result.failed === 0) {
        setSuccessMsg(t('tse.batch.done', { n: result.succeeded }));
        setTimeout(() => setSuccessMsg(''), 3000);
        clearSelection();
      } else {
        // Los que fallaron se quedan seleccionados para reintentar o corregir a mano
        const failedIds = new Set(result.results.filter(r => !r.success).map(r => r.attendance_id));
        setSelectedIds(failedIds);
        showToast(t('tse.batch.partial', { ok: result.succeeded, failed: result.failed }), 'warning');
      }
      await loadRecords();
    } catch (err) {
      showToast(t('tse.error', { error: err instanceof Error ? err.message : t('common.unknown') }), 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  // ========================================
  // EDITING
  // ========================================

  const startEdit = (record: AttendanceRow) => {
    setEditingId(record.id);
    setEditValues(correctionFormFor(record));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(EMPTY_CORRECTION);
  };

  const saveCorrection = async (record: AttendanceRow) => {
    if (!editValues.reason.trim()) {
      showToast(t('tse.reason_required'), 'warning');
      return;
    }

    if (!appUser?.id) return;

    setSaving(true);
    try {
      // Horas NZ de ese día → instante UTC (desfase correcto en verano e invierno)
      const updates = buildCorrectionUpdates(record, editValues);

      await attendanceService.correctAttendance(
        record.id,
        updates,
        editValues.reason.trim(),
        appUser.id
      );

      setEditingId(null);
      setSuccessMsg(t('tse.corrected', { name: record.picker?.name || t('roles.picker') }));
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadRecords();
    } catch (err) {
      showToast(t('tse.error', { error: err instanceof Error ? err.message : t('common.unknown') }), 'error');
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
            <span aria-hidden="true" className="material-symbols-outlined text-xl text-amber-600">schedule</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-main">{t('timesheet.title')}</h2>
            <p className="text-sm text-text-muted">{t('tse.subtitle')}</p>
            {pickerSet && <p className="text-xs text-text-muted">{t('tse.team_only')}</p>}
          </div>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-base text-text-muted">
            calendar_today
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayNZST()}
            title={t('tse.select_date')}
            aria-label={t('tse.date')}
            className="px-3 py-2 border border-border-light rounded-xl text-sm font-medium text-text-sub bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined text-lg text-green-600">check_circle</span>
          <span className="text-sm font-medium text-green-700">{successMsg}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <span aria-hidden="true" className="material-symbols-outlined text-3xl text-text-muted animate-spin">
            progress_activity
          </span>
        </div>
      )}

      {/* Empty State */}
      {!loading && records.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-border-light">
          <span aria-hidden="true" className="material-symbols-outlined text-5xl mx-auto text-slate-300 mb-4">
            schedule
          </span>
          <p className="text-text-muted font-medium">{t('tse.empty', { date: formatNZDate(selectedDate, 'medium') })}</p>
          <p className="text-sm text-text-muted mt-1">{t('tse.empty_hint')}</p>
        </div>
      )}

      {/* Descansos sin anotar: solo se descuenta lo anotado, hay que anotarlos antes de cerrar el día */}
      {!loading && breaksMissing > 0 && (
        <div role="status" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined text-lg text-amber-600">warning</span>
          <span className="text-sm font-medium text-amber-800">{t('tse.break_missing_banner', { n: breaksMissing })}</span>
        </div>
      )}

      {/* Selección para corregir en lote */}
      {!loading && records.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={selectFlagged}
            disabled={flaggedCount === 0 || batchSaving}
            className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-800 font-semibold text-xs hover:bg-amber-50 disabled:opacity-50"
          >
            {t('tse.batch.select_flagged', { n: flaggedCount })}
          </button>
          {selectedRecords.length > 0 && (
            <span className="text-xs text-text-muted">{t('tse.batch.selected', { n: selectedRecords.length })}</span>
          )}
        </div>
      )}

      {/* Panel «Corregir N fichajes» */}
      {!loading && selectedRecords.length > 0 && (
        <TimesheetBatchPanel
          count={selectedRecords.length}
          form={batchValues}
          saving={batchSaving}
          isOnline={isOnline}
          onChangeForm={patch => setBatchValues(v => ({ ...v, ...patch }))}
          onApply={applyBatch}
          onClear={clearSelection}
        />
      )}

      {/* Table */}
      {!loading && records.length > 0 && (
        <div className="bg-white rounded-xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="pl-4 pr-1 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => selectAll(e.target.checked)}
                    disabled={batchSaving}
                    aria-label={t('tse.batch.select_all')}
                    className="size-4 accent-amber-600"
                  />
                </th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">{t('roles.picker')}</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">{t('tse.check_in')}</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">{t('tse.check_out')}</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold" title={t('tse.break_title')}>{t('tse.break')}</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold" title={t('tse.hours_title')}>{t('pay.col.hours')}</th>
                <th className="text-left px-4 py-3 text-text-sub font-semibold">{t('hr.status')}</th>
                <th className="text-right px-4 py-3 text-text-sub font-semibold">{t('tse.action')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => (
                <TimesheetRow
                  key={record.id}
                  record={record}
                  isEditing={editingId === record.id}
                  form={editValues}
                  saving={saving || batchSaving}
                  onChangeForm={patch => setEditValues(v => ({ ...v, ...patch }))}
                  onStartEdit={startEdit}
                  onCancel={cancelEdit}
                  onSave={saveCorrection}
                  selected={selectedIds.has(record.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
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
                // Mismo alcance que la tabla (el team leader solo ve su equipo)
                setDailyTimesheet(pickerSet ? data.filter(r => pickerSet.has(r.picker_id)) : data);
              } catch (err) {
                logger.error('[Timesheet] Failed to generate daily timesheet:', err);
                showToast(t('tse.generate_failed'), 'error');
              } finally {
                setGeneratingTimesheet(false);
              }
            }}
            disabled={generatingTimesheet}
            className="bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {generatingTimesheet ? (
              <span aria-hidden="true" className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            ) : (
              <span aria-hidden="true" className="material-symbols-outlined text-lg">summarize</span>
            )}
            {t('tse.generate')}
          </button>
        </div>
      )}

      {/* Timesheet completo con produccion y earnings */}
      {dailyTimesheet.length > 0 && <DailyTimesheetSummary rows={dailyTimesheet} date={selectedDate} />}

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-lg text-amber-600 mt-0.5">warning</span>
          <div>
            <p className="text-sm font-medium text-amber-800">{t('tse.audit_title')}</p>
            <p className="text-xs text-amber-700 mt-1">
              {t('tse.audit_body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
