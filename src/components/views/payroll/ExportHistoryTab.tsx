/**
 * ExportHistoryTab — Payroll Export Log
 * Tracks all payroll exports with format, date, and download info
 * Uses localStorage to persist export history
 */
import { logger } from '@/utils/logger';
import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate, formatNZTime } from '@/utils/nzFormat';

export interface ExportRecord {
    id: string;
    format: string;
    date: string;
    filename: string;
    recordCount: number;
    totalEarnings: number;
    timestamp: string;
}

const STORAGE_KEY = 'harvestpro_export_history';

export function logExportToHistory(record: Omit<ExportRecord, 'id' | 'timestamp'>): void {
    const history = getExportHistory();
    history.unshift({
        ...record,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
    });
    // Keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
}

export function getExportHistory(): ExportRecord[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        logger.warn('[ExportHistory] Failed to parse history:', e);
        return [];
    }
}

const ExportHistoryTab: React.FC = () => {
    const [history, setHistory] = useState<ExportRecord[]>([]);
    const { t } = useTranslation();

    useEffect(() => {
        setHistory(getExportHistory());
    }, []);

    const handleDelete = (id: string) => {
        const updated = history.filter(h => h.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setHistory(updated);
    };

    const handleClearAll = () => {
        if (!confirm(t('pay.hist.confirm_clear'))) return;
        localStorage.removeItem(STORAGE_KEY);
        setHistory([]);
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
                {history.length > 0 && (
                    <button
                        onClick={handleClearAll}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        {t('pay.hist.clear_all')}
                    </button>
                )}
            </div>

            {/* Empty State */}
            {history.length === 0 ? (
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
                                    {record.format.toUpperCase()} • {t('pay.hist.line', { n: record.recordCount, total: formatNZD(record.totalEarnings, 0) })}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-text-muted">
                                    {formatNZDate(record.timestamp, 'dayMonth')}
                                </p>
                                <p className="text-[10px] text-text-muted">
                                    {formatNZTime(record.timestamp)}
                                </p>
                            </div>
                            <button aria-label={t('hr.docs.delete')}
                                onClick={() => handleDelete(record.id)}
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
