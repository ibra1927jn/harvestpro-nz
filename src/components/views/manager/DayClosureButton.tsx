import { logger } from '@/utils/logger';
import { useEffect, useState } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { todayNZST } from '@/utils/nzst';
import { dayClosureRepository } from '@/repositories/day-closure.repository';
import { logAudit } from '@/services/audit.service';
import { payrollService, PayrollResult } from '@/services/payroll.service';
import Toast from '@/components/ui/Toast';
import { useTranslation } from '@/i18n';
import { formatNZD } from '@/utils/nzFormat';
import { withBold } from '@/i18n/withBold';

interface ClosureConfirmModalProps {
    summary: PayrollResult;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

const ClosureConfirmModal = ({ summary, onConfirm, onCancel, isLoading }: ClosureConfirmModalProps) => {
    const { t } = useTranslation();
    return (
        <div className="modal-overlay">
            <div className="modal-content day-closure-modal">
                <h2>🔒 {t('close.title')}</h2>

                <div className="closure-warning">
                    <span aria-hidden="true" className="material-symbols-outlined">warning</span>
                    <p>{withBold(t('close.warning'))}</p>
                </div>

                <div className="closure-summary">
                    <h3>{t('close.day_summary')}</h3>

                    <div className="summary-grid">
                        <div className="summary-item">
                            <span className="label">{t('pay.total_buckets')}</span>
                            <span className="value">{summary.summary.total_buckets}</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">{t('pay.calc.hours')}</span>
                            <span className="value">{summary.summary.total_hours.toFixed(1)}h</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">{t('pay.piece_rate')}</span>
                            <span className="value">{formatNZD(summary.summary.total_piece_rate_earnings)}</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">{t('close.wage_top_up')}</span>
                            <span className="value top-up">{formatNZD(summary.summary.total_top_up)}</span>
                        </div>

                        <div className="summary-item total">
                            <span className="label">{t('close.total_cost')}</span>
                            <span className="value">{formatNZD(summary.summary.total_earnings)} NZD</span>
                        </div>
                    </div>

                    <div className="compliance-section">
                        <h4>{t('admin.compliance')}</h4>
                        <div className="compliance-stats">
                            <div className="stat">
                                <span className="icon">👥</span>
                                <span>{t('close.workers', { n: summary.compliance.workers_total })}</span>
                            </div>
                            <div className={`stat ${summary.compliance.workers_below_minimum > 0 ? 'warning' : 'success'}`}>
                                <span className="icon">⚠️</span>
                                <span>{t('close.required_top_up', { n: summary.compliance.workers_below_minimum })}</span>
                            </div>
                            <div className="stat success">
                                <span className="icon">✅</span>
                                <span>{t('close.compliance_rate', { pct: summary.compliance.compliance_rate.toFixed(0) })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        onClick={onCancel}
                        className="btn-secondary"
                        disabled={isLoading}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="btn-danger"
                        disabled={isLoading}
                    >
                        {isLoading ? t('close.closing') : `🔒 ${t('close.confirm')}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const DayClosureButton = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [summary, setSummary] = useState<PayrollResult | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
    const { t } = useTranslation();

    const orchard = useHarvestStore(state => state.orchard);
    const currentUser = useHarvestStore(state => state.currentUser);
    const fetchGlobalData = useHarvestStore(state => state.fetchGlobalData);
    const dayClosed = useHarvestStore(state => state.dayClosed);
    const setDayClosed = useHarvestStore(state => state.setDayClosed);

    // El estado sale de day_closures (no solo de memoria): tras recargar no se
    // puede cerrar dos veces
    useEffect(() => {
        if (!orchard?.id) return;
        let cancelled = false;
        dayClosureRepository.getForDate(orchard.id, todayNZST())
            .then(row => { if (!cancelled) setDayClosed(row?.status === 'closed'); })
            .catch(e => logger.warn('[DayClosure] Could not read today\'s closure:', e));
        return () => { cancelled = true; };
    }, [orchard?.id, setDayClosed]);

    const handleClosureClick = async () => {
        if (dayClosed) return;
        setIsLoading(true);

        try {
            // Get today's summary from Edge Function
            const today = todayNZST();
            const payrollSummary = await payrollService.calculatePayroll(
                orchard?.id || '',
                today,
                today
            );

            setSummary(payrollSummary);
            setShowConfirm(true);

        } catch (error) {

            logger.error('Error fetching day summary:', error);
            setToast({ message: t('close.summary_failed'), type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const confirmClosure = async () => {
        if (!summary || !orchard?.id || !currentUser?.id) return;

        setIsLoading(true);

        try {
            const today = todayNZST();

            // 1. day_closures (upsert: un día reabierto se vuelve a cerrar)
            const closure = await dayClosureRepository.close(orchard.id, today, currentUser.id, {
                total_buckets: summary.summary.total_buckets,
                total_cost: summary.summary.total_earnings,
                total_hours: summary.summary.total_hours,
                wage_violations: summary.compliance.workers_below_minimum,
            });

            // 2. Auditoría por submit-audit-log (columnas reales; antes un insert
            //    directo con columnas inexistentes daba 400 sin que nadie lo viera)
            void logAudit('day.closed', 'day_closed', {
                userId: currentUser.id,
                orchardId: orchard.id,
                entityType: 'day_closures',
                entityId: closure.id,
                immediate: true,
                details: {
                    date: today,
                    total_buckets: summary.summary.total_buckets,
                    total_cost: summary.summary.total_earnings,
                    total_top_up: summary.summary.total_top_up,
                    compliance_rate: summary.compliance.compliance_rate,
                },
            });

            // 3. Confirmación visible y estado «día cerrado» para todos
            setToast({ message: `✅ ${t('close.done')}`, type: 'success' });
            setShowConfirm(false);
            setDayClosed(true);
            await fetchGlobalData();

        } catch (error) {

            logger.error('Error closing day:', error);
            setToast({
                message: t('close.failed', { error: error instanceof Error ? error.message : t('common.unknown_error') }),
                type: 'error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={handleClosureClick}
                className="btn-close-day"
                disabled={isLoading || dayClosed}
                aria-disabled={isLoading || dayClosed}
            >
                {dayClosed ? (
                    <>🔒 {t('close.already_closed')}</>
                ) : isLoading ? (
                    <>⏳ {t('common.loading')}</>
                ) : (
                    <>🔒 {t('close.title')}</>
                )}
            </button>
            {dayClosed && (
                <p role="status" data-testid="day-closed-status" className="mt-2 text-xs font-semibold text-emerald-700">
                    {t('close.closed_status')}
                </p>
            )}

            {showConfirm && summary && (
                <ClosureConfirmModal
                    summary={summary}
                    onConfirm={confirmClosure}
                    onCancel={() => setShowConfirm(false)}
                    isLoading={isLoading}
                />
            )}

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </>
    );
};
