import { logger } from '@/utils/logger';
import { useState } from 'react';
import { supabase } from '@/services/supabase';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { nowNZST, todayNZST } from '@/utils/nzst';
import { payrollService, PayrollResult } from '@/services/payroll.service';
import Toast from '@/components/ui/Toast';
import { useTranslation } from '@/i18n';
import { formatNZD } from '@/utils/nzFormat';

interface ClosureConfirmModalProps {
    summary: PayrollResult;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

/** "texto <b>negrita</b> texto" → mismo texto con <strong> (la traducción decide qué va en negrita) */
const withBold = (text: string) =>
    text.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));

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
    const setDayClosed = useHarvestStore(state => state.setDayClosed);

    const handleClosureClick = async () => {
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
        if (!summary) return;

        setIsLoading(true);

        try {
            const today = todayNZST();

            // 1. Insert into day_closures
            const { data: closure, error: closureError } = await supabase
                .from('day_closures')
                .insert({
                    orchard_id: orchard?.id,
                    date: today,
                    status: 'closed',
                    closed_by: currentUser?.id,
                    closed_at: nowNZST(),
                    total_buckets: summary.summary.total_buckets,
                    total_cost: summary.summary.total_earnings,
                    total_hours: summary.summary.total_hours,
                    wage_violations: summary.compliance.workers_below_minimum,
                })
                .select()
                .single();

            if (closureError) {
                throw closureError;
            }

            // 2. Insert audit log
            await supabase
                .from('audit_logs')
                .insert({
                    event_type: 'day.closure',
                    user_id: currentUser?.id,
                    metadata: {
                        closure_id: closure.id,
                        date: today,
                        summary: {
                            total_buckets: summary.summary.total_buckets,
                            total_cost: summary.summary.total_earnings,
                            total_top_up: summary.summary.total_top_up,
                            compliance_rate: summary.compliance.compliance_rate,
                        },
                    },
                });

            // 3. Show confirmation via Toast
            setToast({ message: `✅ ${t('close.done')}`, type: 'success' });
            setShowConfirm(false);

            // Refresh global state instead of reloading page
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
                disabled={isLoading}
            >
                {isLoading ? (
                    <>⏳ {t('common.loading')}</>
                ) : (
                    <>🔒 {t('close.title')}</>
                )}
            </button>

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