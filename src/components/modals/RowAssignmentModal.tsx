/**
 * RowAssignmentModal — el team leader lleva a gente de su equipo a una fila.
 * Solo ofrece las filas que el manager asignó a su equipo (`allowedRows`): el
 * servidor rechaza cualquier otra (migración 20261027040000).
 */

import React, { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { useTranslation } from '@/i18n';

export interface PickerForAssignment {
  id: string;
  name: string;
  avatar: string;
  idNumber: string;
  status: 'Active' | 'Break' | 'Below Minimum' | 'Off Duty';
}

interface RowAssignmentModalProps {
  onClose: () => void;
  onAssign: (rowNumber: number, assignedPickers: string[]) => Promise<void> | void;
  pickers: PickerForAssignment[];
  /** Filas que el manager asignó al equipo (las únicas que se pueden elegir) */
  allowedRows: number[];
  /** Fila preseleccionada (al abrir el modal tocando una fila del mapa) */
  initialRow?: number;
}

const RowAssignmentModal: React.FC<RowAssignmentModalProps> = ({ onClose, onAssign, pickers, initialRow, allowedRows }) => {
  const { t } = useTranslation();
  const rows = [...new Set(allowedRows)].sort((a, b) => a - b);
  const [rowNumber, setRowNumber] = useState(
    initialRow && rows.includes(initialRow) ? String(initialRow) : rows.length === 1 ? String(rows[0]) : ''
  );
  const [selectedPickers, setSelectedPickers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const togglePicker = (pickerId: string) => {
    setSelectedPickers(prev =>
      prev.includes(pickerId) ? prev.filter(id => id !== pickerId) : [...prev, pickerId]
    );
  };

  const handleAssign = async () => {
    if (!rowNumber || selectedPickers.length === 0) return;
    setIsSubmitting(true);
    try {
      await onAssign(parseInt(rowNumber, 10), selectedPickers);
      onClose();
    } catch (_error) {
      showToast(t('pd.assign_row_error'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activePickers = pickers.filter(p => p.status !== 'Off Duty');

  return (
    <ModalOverlay onClose={onClose}>
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-text-main">{t('pd.assign_row')}</h3>
          <button aria-label={t('common.close')}
            onClick={onClose}
            className="text-text-muted hover:text-text-main transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-xs font-bold text-text-muted uppercase mb-2">{t('pd.assigned_rows_label')}</p>
        {rows.length === 0 ? (
          <p data-testid="no-assigned-rows" className="bg-slate-50 rounded-xl p-4 text-sm text-text-muted border border-border-light mb-6">
            {t('tl.tasks.no_assigned_rows')}
          </p>
        ) : (
          <div role="group" aria-label={t('pd.assigned_rows_label')} className="flex flex-wrap gap-2 mb-6">
            {rows.map(r => (
              <button
                key={r}
                type="button"
                aria-pressed={rowNumber === String(r)}
                onClick={() => setRowNumber(String(r))}
                className={`min-w-[3rem] px-3 py-2 rounded-xl border-2 text-lg font-black transition-colors ${rowNumber === String(r) ? 'border-primary bg-primary/10 text-primary' : 'border-border-light bg-white text-text-main'}`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs font-bold text-text-muted uppercase mb-3">
          {t('pd.assign_pickers_n', { n: selectedPickers.length })}
        </p>
        {activePickers.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-6 text-center border border-border-light mb-6">
            <span aria-hidden="true" className="material-symbols-outlined text-text-muted text-4xl mb-2">
              group_off
            </span>
            <p className="text-sm text-text-muted">{t('pd.no_active_pickers')}</p>
          </div>
        ) : (
          <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
            {activePickers.map(picker => (
              <label
                key={picker.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPickers.includes(picker.id)}
                  onChange={() => togglePicker(picker.id)}
                  className="size-5 accent-primary"
                />
                <div className="size-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-text-sub text-sm">
                  {picker.avatar}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-text-main text-sm">{picker.name}</p>
                  <p className="text-xs text-text-muted">ID: {picker.idNumber}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        <button
          onClick={handleAssign}
          disabled={!rowNumber || selectedPickers.length === 0 || isSubmitting}
          className="w-full py-4 gradient-primary glow-primary text-white rounded-xl font-bold uppercase disabled:bg-surface-tertiary disabled:shadow-none active:scale-95 transition-all"
        >
          {isSubmitting ? t('assignModal.assigning') : t('pd.assign_row_n', { n: rowNumber || '' })}
        </button>
      </div>
    </ModalOverlay>
  );
};

export default RowAssignmentModal;
