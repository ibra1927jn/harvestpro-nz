/**
 * TimesheetRow — una fila del editor de hojas de horas (ver o corregir).
 */
import { todayNZST } from '@/utils/nzst';
import { AttendanceRow, CorrectionForm, formatTime, calculateHours, isAbnormal } from './timesheet-utils';
import { statusLabel } from '@/i18n/statusLabel';
import { useTranslation } from '@/i18n';

interface TimesheetRowProps {
  record: AttendanceRow;
  isEditing: boolean;
  form: CorrectionForm;
  saving: boolean;
  onChangeForm: (patch: Partial<CorrectionForm>) => void;
  onStartEdit: (record: AttendanceRow) => void;
  onCancel: () => void;
  onSave: (record: AttendanceRow) => void;
}

export default function TimesheetRow({
  record, isEditing, form, saving, onChangeForm, onStartEdit, onCancel, onSave,
}: TimesheetRowProps) {
  const { t } = useTranslation();
  const hours = calculateHours(record);
  const unclosed = !!record.check_in && !record.check_out && record.date < todayNZST();
  const abnormal = isAbnormal(hours);

  return (
    <tr
      className={`border-t border-border-light ${abnormal ? 'bg-red-50' : ''} ${isEditing ? 'bg-amber-50' : ''}`}
    >
      {/* Picker Name */}
      <td className="px-4 py-3">
        <div className="font-medium text-text-main">
          {record.picker?.name || t('common.unknown')}
        </div>
        <div className="text-xs text-text-muted">{record.picker?.picker_id}</div>
      </td>

      {/* Check-In */}
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="time"
            value={form.checkIn}
            onChange={e => onChangeForm({ checkIn: e.target.value })}
            title={t('tse.check_in_time')}
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
            value={form.checkOut}
            onChange={e => onChangeForm({ checkOut: e.target.value })}
            title={t('tse.check_out_time')}
            className="px-2 py-1 border border-amber-300 rounded-lg text-sm w-24 focus:ring-2 focus:ring-amber-500 outline-none"
          />
        ) : (
          <span
            className={`font-mono ${!record.check_out ? 'text-red-500' : ''}`}
          >
            {!record.check_out && (
              <span aria-hidden="true" className="material-symbols-outlined text-sm inline mr-1 text-red-500">
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
            value={form.breakStart}
            onChange={e => onChangeForm({ breakStart: e.target.value })}
            title={t('tse.break_start')}
            className="px-2 py-1 border border-amber-300 rounded-lg text-sm w-24 focus:ring-2 focus:ring-amber-500 outline-none"
          />
        ) : record.break_start ? (
          <span className="font-mono">{formatTime(record.break_start)}</span>
        ) : (
          <span className="text-xs text-text-muted" title={t('tse.auto_break_title')}>{t('tse.auto')}</span>
        )}
      </td>

      {/* Hours */}
      <td className="px-4 py-3">
        <span
          className={`font-mono font-bold ${abnormal || unclosed ? 'text-red-600' : 'text-text-sub'}`}
          title={unclosed ? t('tse.unclosed_title') : undefined}
        >
          {hours !== null ? `${hours}h` : unclosed ? t('tse.not_closed') : '—'}
        </span>
        {abnormal && (
          <span aria-hidden="true" className="material-symbols-outlined text-sm inline ml-1 text-red-500">
            warning
          </span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        {record.corrected_at ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
            <span aria-hidden="true" className="material-symbols-outlined text-xs">edit</span>
            {t('tse.corrected_badge')}
          </span>
        ) : (
          <span className="text-xs text-text-muted">{statusLabel(t, record.status)}</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('tse.reason_placeholder')}
              value={form.reason}
              onChange={e => onChangeForm({ reason: e.target.value })}
              className="w-full px-2 py-1 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={onCancel}
                className="p-1.5 text-text-muted hover:text-text-sub rounded-lg"
                aria-label={t('tse.cancel_edit')}
                disabled={saving}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
              </button>
              <button
                onClick={() => onSave(record)}
                disabled={saving || !form.reason.trim()}
                className="p-1.5 text-green-600 hover:text-green-700 rounded-lg disabled:opacity-50"
                aria-label={t('tse.save_correction')}
              >
                {saving ? (
                  <span aria-hidden="true" className="material-symbols-outlined text-base animate-spin">
                    progress_activity
                  </span>
                ) : (
                  <span aria-hidden="true" className="material-symbols-outlined text-base">save</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => onStartEdit(record)}
            className="p-2 text-text-muted hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            aria-label={t('tse.edit_of', { name: record.picker?.name ?? '' })}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">edit</span>
          </button>
        )}
      </td>
    </tr>
  );
}
