/**
 * WageRatesPanel.tsx — Admin/HR Configurable Wage Rates
 *
 * Allows Admin and HR_ADMIN to set hourly rates per job type.
 * Changes are persisted to the `wage_rates` Supabase table.
 *
 * Features:
 * - Per-job-type wage configuration
 * - Piece rate toggle for eligible roles (picker, team_leader)
 * - NZ legal minimum wage floor validation (real-time)
 * - Effective date support (future-dated rate changes)
 * - Full audit trail via DB trigger
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getWageRates,
  saveWageRate,
  validateWageRate,
  type WageRatesConfig,
} from '@/services/wage-rates.service';
import { type JobType, NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import { useAuth } from '@/context';
import { todayNZST } from '@/utils/nzst';
import { roleLabel } from '@/i18n/roleLabel';
import type { TFunction } from '@/i18n';
import { formatNZD, formatNZDateTime } from '@/utils/nzFormat';
import { withBold } from '@/i18n/withBold';
import { useTranslation } from '@/i18n';

// Icono de cada puesto (el nombre sale traducido con jobLabel)
const JOB_TYPE_ICONS: Record<JobType, string> = {
  picker:       '🍒',
  team_leader:  '👑',
  runner:       '🚐',
  qc_inspector: '🔍',
  logistics:    '📦',
  hr_admin:     '👤',
  manager:      '📊',
  admin:        '⚙️',
};
const jobLabel = (t: TFunction, jt: JobType) =>
  `${JOB_TYPE_ICONS[jt]} ${jt === 'picker' ? t('wage.picker_piece') : roleLabel(t, jt)}`;

const JOB_ORDER: JobType[] = [
  'picker', 'team_leader', 'runner', 'qc_inspector',
  'logistics', 'hr_admin', 'manager', 'admin',
];

interface RateEditState {
  hourly_rate: string;
  piece_rate_per_bin: string;
  is_piece_rate_eligible: boolean;
  effective_from: string;
  notes: string;
  saving: boolean;
  error: string | null;
  success: boolean;
}

export function WageRatesPanel({ orchardId }: { orchardId: string }) {
  const { t } = useTranslation();
  const { appUser } = useAuth();
  const [config, setConfig] = useState<WageRatesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editStates, setEditStates] = useState<Record<JobType, RateEditState>>({} as Record<JobType, RateEditState>);
  const [expandedJob, setExpandedJob] = useState<JobType | null>(null);

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getWageRates(orchardId);
      setConfig(cfg);

      // Initialise edit state from DB config
      const states = {} as Record<JobType, RateEditState>;
      JOB_ORDER.forEach(jt => {
        const rate = cfg.rates[jt];
        states[jt] = {
          hourly_rate: rate.hourly_rate.toFixed(2),
          piece_rate_per_bin: rate.piece_rate_per_bin.toFixed(2),
          is_piece_rate_eligible: rate.is_piece_rate_eligible,
          // Hoy en NZ (con la fecha UTC, por la mañana la tarifa nueva quedaba con fecha de ayer)
          effective_from: todayNZST(),
          notes: rate.notes ?? '',
          saving: false,
          error: null,
          success: false,
        };
      });
      setEditStates(states);
    } finally {
      setLoading(false);
    }
  }, [orchardId]);

  useEffect(() => { loadRates(); }, [loadRates]);

  const updateEdit = (jt: JobType, field: keyof RateEditState, value: unknown) => {
    setEditStates(s => ({
      ...s,
      [jt]: { ...s[jt], [field]: value, error: null, success: false },
    }));
  };

  const handleSave = async (jt: JobType) => {
    const state = editStates[jt];
    const rate = parseFloat(state.hourly_rate);
    const pieceRate = parseFloat(state.piece_rate_per_bin);

    const { valid, violations } = validateWageRate(rate, jt);
    if (!valid) {
      updateEdit(jt, 'error', violations.join(' | '));
      return;
    }

    updateEdit(jt, 'saving', true);
    const result = await saveWageRate(orchardId, {
      job_type: jt,
      hourly_rate: rate,
      is_piece_rate_eligible: state.is_piece_rate_eligible,
      piece_rate_per_bin: pieceRate,
      effective_from: state.effective_from,
      notes: state.notes,
      updated_by: appUser?.id ?? 'unknown',
    });

    if (result.success) {
      setEditStates(s => ({ ...s, [jt]: { ...s[jt], saving: false, success: true, error: null } }));
      await loadRates();
    } else {
      setEditStates(s => ({ ...s, [jt]: { ...s[jt], saving: false, error: result.error ?? t('wage.save_failed'), success: false } }));
    }
  };

  if (loading) return (
    <div className="wage-rates-loading">
      <div className="spinner" />
      <span>{t('wage.loading')}</span>
    </div>
  );

  return (
    <div className="wage-rates-panel">
      <div className="wage-rates-header">
        <div>
          <h2 className="wage-rates-title">💼 {t('wage.title')}</h2>
          <p className="wage-rates-subtitle">
            {withBold(t('wage.subtitle', { wage: formatNZD(NZ_MINIMUM_WAGE_2026) }))}
          </p>
        </div>
        <div className="wage-rates-legal-badge">
          <span className="badge-dot" />
          {/* i18n-ignore: nombre de la ley, no se traduce */}
          NZ Employment Relations Act 2000
        </div>
      </div>

      <div className="wage-rates-grid">
        {JOB_ORDER.map(jt => {
          const state = editStates[jt];
          const isExpanded = expandedJob === jt;
          const currentDbRate = config?.rates[jt];
          const rateNum = parseFloat(state.hourly_rate || '0');
          const isBelowMinimum = rateNum < NZ_MINIMUM_WAGE_2026 && rateNum > 0;

          return (
            <div key={jt} className={`wage-card ${isExpanded ? 'expanded' : ''} ${isBelowMinimum ? 'has-error' : ''}`}>
              <button
                className="wage-card-header"
                onClick={() => setExpandedJob(isExpanded ? null : jt)}
                aria-expanded={isExpanded ? 'true' : 'false'}
              >
                <span className="job-label">{jobLabel(t, jt)}</span>
                <div className="wage-card-summary">
                  <span className="current-rate">{currentDbRate ? `${formatNZD(currentDbRate.hourly_rate)}${t('common.per_hour')}` : ''}</span>
                  {currentDbRate?.is_piece_rate_eligible && (
                    <span className="piece-badge">{t('wage.plus_piece')}</span>
                  )}
                  <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && state && (
                <div className="wage-card-body">
                  <div className="form-row">
                    <label htmlFor={`rate-${jt}`} className="form-label">
                      {t('wage.hourly_rate')}
                    </label>
                    <div className="input-wrapper">
                      <span className="input-prefix">$</span>
                      <input
                        id={`rate-${jt}`}
                        type="number"
                        min={NZ_MINIMUM_WAGE_2026}
                        step="0.05"
                        className={`rate-input ${isBelowMinimum ? 'input-error' : ''}`}
                        value={state.hourly_rate}
                        onChange={e => updateEdit(jt, 'hourly_rate', e.target.value)}
                        aria-describedby={`rate-hint-${jt}`}
                      />
                      <span className="input-suffix">{t('common.per_hour')}</span>
                    </div>
                    <p id={`rate-hint-${jt}`} className={`form-hint ${isBelowMinimum ? 'error-hint' : ''}`}>
                      {isBelowMinimum
                        ? `⚠️ ${t('wage.below_min', { wage: formatNZD(NZ_MINIMUM_WAGE_2026) })}`
                        : t('wage.min_hint', { wage: formatNZD(NZ_MINIMUM_WAGE_2026) })
                      }
                    </p>
                  </div>

                  <div className="form-row toggle-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={state.is_piece_rate_eligible}
                        onChange={e => updateEdit(jt, 'is_piece_rate_eligible', e.target.checked)}
                      />
                      <span>{t('wage.piece_eligible')}</span>
                    </label>
                  </div>

                  {state.is_piece_rate_eligible && (
                    <div className="form-row">
                      <label htmlFor={`piece-${jt}`} className="form-label">
                        {t('wage.piece_per_bin')}
                      </label>
                      <div className="input-wrapper">
                        <span className="input-prefix">$</span>
                        <input
                          id={`piece-${jt}`}
                          type="number"
                          min={0}
                          step="0.10"
                          className="rate-input"
                          value={state.piece_rate_per_bin}
                          onChange={e => updateEdit(jt, 'piece_rate_per_bin', e.target.value)}
                        />
                        <span className="input-suffix">{t('wage.per_bin')}</span>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <label htmlFor={`effective-${jt}`} className="form-label">
                      {t('wage.effective_from')}
                    </label>
                    <input
                      id={`effective-${jt}`}
                      type="date"
                      className="date-input"
                      value={state.effective_from}
                      min={todayNZST()}
                      onChange={e => updateEdit(jt, 'effective_from', e.target.value)}
                    />
                    <p className="form-hint">{t('wage.future_hint')}</p>
                  </div>

                  <div className="form-row">
                    <label htmlFor={`notes-${jt}`} className="form-label">
                      {t('wage.notes')}
                    </label>
                    <input
                      id={`notes-${jt}`}
                      type="text"
                      className="notes-input"
                      placeholder={t('wage.notes_placeholder')}
                      value={state.notes}
                      onChange={e => updateEdit(jt, 'notes', e.target.value)}
                    />
                  </div>

                  {state.error && (
                    <div className="form-error" role="alert">
                      ❌ {state.error}
                    </div>
                  )}
                  {state.success && (
                    <div className="form-success" role="status">
                      ✅ {t('wage.saved')}
                    </div>
                  )}

                  <button
                    className="save-btn"
                    onClick={() => handleSave(jt)}
                    disabled={state.saving || isBelowMinimum}
                  >
                    {state.saving ? t('hr.saving') : t('wage.save')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="wage-rates-footer">
        {t('wage.footer', { date: config?.lastUpdated ? formatNZDateTime(config.lastUpdated) : t('common.unknown') })}
      </p>
    </div>
  );
}
