/**
 * RowAssignmentModal - Modal para asignar pickers a filas
 * Versión centralizada para TeamLeader
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
  onAssign: (
    rowNumber: number,
    side: 'North' | 'South',
    assignedPickers: string[]
  ) => Promise<void> | void;
  pickers: PickerForAssignment[];
  /** Fila preseleccionada (al abrir el modal tocando una fila del mapa) */
  initialRow?: number;
}

const RowAssignmentModal: React.FC<RowAssignmentModalProps> = ({ onClose, onAssign, pickers, initialRow }) => {
  const { t } = useTranslation();
  const [rowNumber, setRowNumber] = useState(initialRow ? String(initialRow) : '');
  const [side, setSide] = useState<'North' | 'South'>('South');
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
      await onAssign(parseInt(rowNumber), side, selectedPickers);
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
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">
              {t('pd.row_number')} *
            </label>
            <input
              type="number"
              value={rowNumber}
              onChange={e => setRowNumber(e.target.value)}
              placeholder="12"
              className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none text-2xl font-black text-center text-text-main bg-white transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('assignModal.side')} *</label>
            <select
              value={side}
              onChange={e => setSide(e.target.value as 'North' | 'South')}
              aria-label={t('assignModal.side')}
              className="w-full px-4 py-3 rounded-xl border-2 border-border-light focus:border-primary outline-none font-bold text-text-main bg-white transition-colors"
            >
              <option value="South">{t('assignModal.side.south')}</option>
              <option value="North">{t('assignModal.side.north')}</option>
            </select>
          </div>
        </div>
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
