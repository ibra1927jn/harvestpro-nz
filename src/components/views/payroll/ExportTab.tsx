/**
 * Exportación de la semana de pago (CSV, Xero, PaySauce, PDF).
 * (Movido sin cambios de marcado desde PayrollTabs.tsx.)
 */
import React, { useState, useEffect } from 'react';
import type { PickerBreakdown } from '@/services/payroll.service';
import { logger } from '@/utils/logger';
import { exportService, type ExportFormat } from '@/services/export.service';
import { logExportToHistory } from './ExportHistoryTab';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { loadOrchardNames } from '@/repositories/pay-rates.repository';
import { namePreview } from './payrollTabsLogic';

/* ── Export Tab ── */
const EXPORT_FORMATS: { format: ExportFormat; label: string; desc: string; icon: string }[] = [
    { format: 'csv', label: 'CSV', desc: 'Excel / Google Sheets', icon: 'table_chart' },
    { format: 'xero', label: 'Xero', desc: 'Payroll import file', icon: 'account_balance' },
    { format: 'paysauce', label: 'PaySauce', desc: 'Bulk upload file', icon: 'cloud_upload' },
    { format: 'pdf', label: 'PDF Report', desc: 'Print or save as PDF', icon: 'picture_as_pdf' },
];

/**
 * Exporta la semana de pago seleccionada, con las mismas cifras que el resto
 * de la pantalla (calculate-payroll). Avisa si hay días con horas estimadas.
 */
export const ExportTab: React.FC<{
    pickers: PickerBreakdown[];
    week: { start: string; end: string; closesOn: string };
    isLoading?: boolean;
    /** Semana cerrada: la exportación es la definitiva */
    closedAt?: string | null;
}> = ({ pickers, week, isLoading = false, closedAt = null }) => {
    const crew = useHarvestStore(s => s.crew);
    const [lastExport, setLastExport] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [orchards, setOrchards] = useState<Record<string, string>>({});
    useEffect(() => { loadOrchardNames().then(setOrchards).catch(() => setOrchards({})); }, []);

    const codeById = new Map(crew.map(p => [p.id, p.picker_id]));
    const data = exportService.preparePayrollData(pickers, { start: week.start, end: week.end }, id => codeById.get(id), {
        closedAt,
        orchardName: id => (id ? orchards[id] ?? id.slice(0, 8) : '—'),
    });
    const toReview = data.crew.filter(p => (p.estimatedDays ?? 0) > 0);
    const disabled = isLoading || data.crew.length === 0;

    const handleExport = (format: ExportFormat) => {
        setExportError(null);
        try {
            const result = exportService.exportPayroll(format, data);
            logExportToHistory({
                format,
                date: data.date,
                filename: result.filename,
                recordCount: result.recordCount,
                totalEarnings: result.totalEarnings,
            });
            setLastExport(result.filename);
        } catch (err) {
            logger.error('[Payroll] Export failed:', err);
            setExportError('No se pudo generar el fichero.');
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">Export pay week</h3>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                    {week.start} → {week.end} · closes Monday {week.closesOn}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                    <div><p className="text-2xl font-black text-slate-800">{data.crew.length}</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Pickers</p></div>
                    <div><p className="text-2xl font-black text-slate-800">{data.summary.totalHours.toFixed(1)}h</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Hours</p></div>
                    <div><p className="text-2xl font-black text-orange-600">${data.summary.grandTotal.toFixed(2)}</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Total pay</p></div>
                </div>
            </div>

            {data.status === 'draft' && (
                <div data-testid="export-draft-warning" className="bg-orange-50/90 border border-orange-200 rounded-2xl px-5 py-3">
                    <p className="text-sm font-extrabold text-orange-900">Draft — this week is not closed yet</p>
                    <p className="text-[12px] text-orange-800 mt-1">Figures can still change. Close the pay week (Dashboard) before exporting to pay; draft files are named "-DRAFT".</p>
                </div>
            )}

            {toReview.length > 0 && (
                <div data-testid="export-estimated-warning" className="bg-amber-50/90 border border-amber-200 rounded-2xl px-5 py-4">
                    <p className="text-sm font-extrabold text-amber-900">
                        {toReview.length} picker{toReview.length === 1 ? '' : 's'} with estimated hours
                    </p>
                    <p className="text-[12px] text-amber-800 mt-1">
                        These shifts were never closed, so their hours are estimated from check-in to the last bucket.
                        Ask the team leader to fix the timesheets before paying: {namePreview(toReview.map(p => p.name))}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXPORT_FORMATS.map(exp => (
                    <button
                        key={exp.format}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleExport(exp.format)}
                        className="group bg-white/80 backdrop-blur-xl rounded-2xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex items-center gap-4 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="size-12 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                            <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-orange-500">{exp.icon}</span>
                        </div>
                        <div>
                            <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">{exp.label}</h4>
                            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mt-0.5">{exp.desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            {lastExport && (
                <p role="status" className="text-sm font-bold text-emerald-700">Downloaded {lastExport}</p>
            )}
            {exportError && (
                <p role="alert" className="text-sm font-bold text-red-600">{exportError}</p>
            )}
            {!isLoading && data.crew.length === 0 && (
                <p className="text-sm text-slate-500">No hours or buckets recorded in this pay week.</p>
            )}
        </div>
    );
};
