/**
 * ExportHistoryTab — Payroll Export Log
 * Historial de exportaciones en el servidor (tabla payroll_exports): quién,
 * cuándo, semana, formato. Antes vivía en localStorage (otro puesto no lo veía)
 * y «Delete» borraba sin preguntar (auditoría 2026-10-23, E).
 */
import { logger } from '@/utils/logger';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate, formatNZTime } from '@/utils/nzFormat';
import {
    payrollExportsRepository,
    type NewPayrollExport,
    type PayrollExportRow,
} from '@/repositories/payroll-exports.repository';

/**
 * Registra una exportación en el historial del servidor. No lanza: la
 * exportación ya se descargó; si no se pudo anotar, se devuelve false.
 */
export async function logExportToHistory(record: NewPayrollExport): Promise<boolean> {
    try {
        await payrollExportsRepository.log(record);
        return true;
    } catch (e) {
        logger.warn('[ExportHistory] Could not log the export on the server:', e);
        return false;
    }
}

const ExportHistoryTab: React.FC = () => {
    const [history, setHistory] = useState<PayrollExportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { t } = useTranslation();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setHistory(await payrollExportsRepository.list());
        } catch (e) {
            logger.warn('[ExportHistory] Could not load history:', e);
            setError(t('pay.hist.load_failed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { void load(); }, [load]);

    const handleDelete = async (record: PayrollExportRow) => {
        if (!window.confirm(t('pay.hist.confirm_delete', { file: record.filename }))) return;
        setError(null);
        try {
            await payrollExportsRepository.remove(record.id);
            setHistory(prev => prev.filter(h => h.id !== record.id));
        } catch (e) {
            logger.warn('[ExportHistory] Delete failed:', e);
            setError(t('pay.hist.delete_failed'));
        }
    };

    const formatIcon = (format: string) => {
        switch (format.toLowerCase()) {
            case 'csv': return 'table_chart';
            case 'pdf': return 'picture_as_pdf';
            case 'xero': return 'account_balance';
            case 'paysauce': return 'restaurant';
            default: return 'download';
        }
    };

    const formatColor = (format: string) => {
        switch (format.toLowerCase()) {
            case 'csv': return 'text-emerald-600 bg-emerald-50';
            case 'pdf': return 'text-red-600 bg-red-50';
            case 'xero': return 'text-blue-600 bg-blue-50';
            case 'paysauce': return 'text-purple-600 bg-purple-50';
            default: return 'text-text-sub bg-slate-50';
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-text-main">{t('pay.hist.title')}</h3>
                    <p className="text-xs text-text-muted">{t('pay.hist.count', { n: history.length })}</p>
                </div>
            </div>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
            {loading && <p className="text-sm text-text-muted">{t('pay.hist.loading')}</p>}

            {/* Empty State */}
            {loading ? null : history.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-slate-300 text-4xl mb-2 block">history</span>
                    <p className="text-sm text-text-muted">{t('pay.hist.empty')}</p>
                    <p className="text-xs text-text-muted mt-1">{t('pay.hist.empty_hint')}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {history.map(record => (
                        <div key={record.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formatColor(record.format)}`}>
                                <span aria-hidden="true" className="material-symbols-outlined text-lg">{formatIcon(record.format)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-text-main truncate">{record.filename}</p>
                                <p className="text-xs text-text-muted">
                                    {record.format.toUpperCase()} • {t('pay.hist.line', { n: record.record_count, total: formatNZD(Number(record.total_earnings), 0) })}
                                </p>
                                <p className="text-[11px] text-text-muted">
                                    {t('pay.hist.week', { from: formatNZDate(record.week_start, 'dayMonth'), to: formatNZDate(record.week_end, 'medium') })}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-text-muted">
                                    {formatNZDate(record.exported_at, 'dayMonth')}
                                </p>
                                <p className="text-[10px] text-text-muted">
                                    {formatNZTime(record.exported_at)}
                                </p>
                            </div>
                            <button aria-label={t('pay.hist.delete_for', { file: record.filename })}
                                onClick={() => void handleDelete(record)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                                title={t('hr.docs.delete')}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExportHistoryTab;
