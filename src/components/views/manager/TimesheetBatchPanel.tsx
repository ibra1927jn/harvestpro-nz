/**
 * TimesheetBatchPanel — «Corregir N fichajes»: la misma entrada / salida /
 * descanso (cada campo opcional: vacío = no tocar) y un motivo para todos
 * los fichajes seleccionados en el editor.
 *
 * Requiere conexión: la corrección va directa a la Edge Function y no se
 * encola en Dexie (la simple tampoco), así que sin red el botón se
 * deshabilita y se avisa.
 */
import { useId } from 'react';
import type { CorrectionForm } from './timesheet-utils';
import { useTranslation } from '@/i18n';

interface TimesheetBatchPanelProps {
  count: number;
  form: CorrectionForm;
  saving: boolean;
  isOnline: boolean;
  onChangeForm: (patch: Partial<CorrectionForm>) => void;
  onApply: () => void;
  onClear: () => void;
}

export default function TimesheetBatchPanel({
  count, form, saving, isOnline, onChangeForm, onApply, onClear,
}: TimesheetBatchPanelProps) {
  const { t } = useTranslation();
  const id = useId();
  const hasChange = !!(form.checkIn || form.checkOut || form.breakStart);
  const canApply = hasChange && !!form.reason.trim() && !saving && isOnline;

  const field = (key: 'checkIn' | 'checkOut' | 'breakStart', label: string) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="block text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-1">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="time"
        value={form[key]}
        onChange={e => onChangeForm({ [key]: e.target.value })}
        disabled={saving}
        className="w-full px-2 py-1.5 border border-amber-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
      />
    </div>
  );

  return (
    <section
      aria-label={t('tse.batch.title', { n: count })}
      className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-amber-900">{t('tse.batch.title', { n: count })}</h3>
          <p className="text-xs text-amber-800 mt-0.5">{t('tse.batch.hint')}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={saving}
          className="text-xs font-bold text-amber-800 hover:text-amber-900 underline underline-offset-2 disabled:opacity-50"
        >
          {t('tse.batch.clear')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field('checkIn', t('tse.check_in'))}
        {field('checkOut', t('tse.check_out'))}
        {field('breakStart', t('tse.break'))}
      </div>

      <input
        type="text"
        placeholder={t('tse.batch.reason_placeholder')}
        aria-label={t('tse.batch.reason_placeholder')}
        value={form.reason}
        onChange={e => onChangeForm({ reason: e.target.value })}
        disabled={saving}
        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
      />

      {!isOnline && (
        <p role="status" className="flex items-start gap-2 text-xs font-medium text-red-700">
          <span aria-hidden="true" className="material-symbols-outlined text-base">cloud_off</span>
          {t('tse.batch.offline')}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          {saving ? (
            <span aria-hidden="true" className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
          ) : (
            <span aria-hidden="true" className="material-symbols-outlined text-lg">done_all</span>
          )}
          {t('tse.batch.apply', { n: count })}
        </button>
      </div>
    </section>
  );
}
