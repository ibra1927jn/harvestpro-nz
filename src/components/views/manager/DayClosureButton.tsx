import { logger } from '@/utils/logger';
import { useState } from 'react';
import { supabase } from '@/services/supabase';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { nowNZST, todayNZST } from '@/utils/nzst';
import { payrollService, PayrollResult } from '@/services/payroll.service';
import Toast from '@/components/ui/Toast';

interface ClosureConfirmModalProps {
    summary: PayrollResult;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading: boolean;
}

const ClosureConfirmModal = ({ summary, onConfirm, onCancel, isLoading }: ClosureConfirmModalProps) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content day-closure-modal">
                <h2>🔒 End & Lock Day</h2>

                <div className="closure-warning">
                    <span aria-hidden="true" className="material-symbols-outlined">warning</span>
                    <p>
                        Once closed, records for this date <strong>cannot be edited or added</strong>.
                        This closure is <strong>permanent and immutable</strong> for legal compliance.
                    </p>
                </div>

                <div className="closure-summary">
                    <h3>Day Summary</h3>

                    <div className="summary-grid">
                        <div className="summary-item">
                            <span className="label">Total Buckets</span>
                            <span className="value">{summary.summary.total_buckets}</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">Hours Worked</span>
                            <span className="value">{summary.summary.total_hours.toFixed(1)}h</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">Piece Rate</span>
                            <span className="value">${summary.summary.total_piece_rate_earnings.toFixed(2)}</span>
                        </div>

                        <div className="summary-item">
                            <span className="label">Wage Top-Up</span>
                            <span className="value top-up">${summary.summary.total_top_up.toFixed(2)}</span>
                        </div>

                        <div className="summary-item total">
                            <span className="label">Total Cost</span>
                            <span className="value">${summary.summary.total_earnings.toFixed(2)} NZD</span>
                        </div>
                    </div>

                    <div className="compliance-section">
                        <h4>Compliance</h4>
                        <div className="compliance-stats">
                            <div className="stat">
                                <span className="icon">👥</span>
                                <span>{summary.compliance.workers_total} workers</span>
                            </div>
                            <div className={`stat ${summary.compliance.workers_below_minimum > 0 ? 'warning' : 'success'}`}>
                                <span className="icon">⚠️</span>
                                <span>{summary.compliance.workers_below_minimum} required top-up</span>
                            </div>
                            <div className="stat success">
                                <span className="icon">✅</span>
                                <span>{summary.compliance.compliance_rate.toFixed(0)}% compliance rate</span>
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
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="btn-danger"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Closing...' : '🔒 Confirm Closure'}
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
            setToast({ message: 'Error fetching day summary. Please try again.', type: 'error' });
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
            setToast({ message: '✅ Day closed and locked successfully', type: 'success' });
            setShowConfirm(false);

            // Refresh global state instead of reloading page
            setDayClosed(true);
            await fetchGlobalData();

        } catch (error) {

            logger.error('Error closing day:', error);
            setToast({
                message: `Error closing day: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                    <>⏳ Loading...</>
                ) : (
                    <>🔒 End & Lock Day</>
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