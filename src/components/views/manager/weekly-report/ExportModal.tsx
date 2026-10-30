/**
 * ExportModal — Format/section selection modal for exporting WeeklyReport
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type { ExportSections } from '@/utils/weeklyReportExport';

interface ExportModalProps {
    onClose: () => void;
    /** Recibe las secciones marcadas (antes se ignoraban) */
    onExportPDF: (sections: ExportSections) => void;
    onExportCSV: () => void;
}

const SECTION_DEFS = [
    { key: 'summary' as const, icon: 'dashboard', label: 'Summary KPIs', desc: 'Total bins, hours, cost, earnings' },
    { key: 'charts' as const, icon: 'trending_up', label: 'Trend Charts', desc: 'Harvest velocity & workforce 7-day sparklines' },
    { key: 'teams' as const, icon: 'groups', label: 'Team Rankings', desc: 'Team bars with efficiency and earnings' },
    { key: 'pickerDetail' as const, icon: 'table_chart', label: 'Detailed Picker Spreadsheet', desc: 'All pickers: sticker #, buckets, hours, earnings, top-up' },
] as const;

const ExportModal: React.FC<ExportModalProps> = ({ onClose, onExportPDF, onExportCSV }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose });

    const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
    const [sections, setSections] = useState<ExportSections>({ summary: true, charts: true, teams: true, pickerDetail: true });
    const toggleSection = (key: keyof typeof sections) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Export report" className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-lg">
                                <span aria-hidden="true" className="material-symbols-outlined text-xl">download</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Export Report</h3>
                                <p className="text-xs text-white/60">Choose sections and format</p>
                            </div>
                        </div>
                        <button aria-label="Close" onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                            <span aria-hidden="true" className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* Format Toggle */}
                <div className="p-5 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Format</p>
                    <div className="flex gap-2">
                        {(['pdf', 'csv'] as const).map(f => {
                            const isActive = format === f;
                            const activeClass = f === 'pdf'
                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                                : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25';
                            return (
                                <button
                                    key={f}
                                    onClick={() => setFormat(f)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${isActive ? activeClass : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-lg">{f === 'pdf' ? 'picture_as_pdf' : 'table_chart'}</span>
                                    {f === 'pdf' ? 'PDF Report' : 'CSV (Excel)'}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* PDF Section Toggles */}
                {format === 'pdf' && (
                    <div className="p-5 space-y-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Sections to include</p>
                        {SECTION_DEFS.map(section => (
                            <label
                                key={section.key}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${sections[section.key] ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={sections[section.key]}
                                    onChange={() => toggleSection(section.key)}
                                    className="w-4 h-4 accent-indigo-500 rounded"
                                />
                                <div className={`p-1.5 rounded-lg ${sections[section.key] ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <span aria-hidden="true" className="material-symbols-outlined text-base">{section.icon}</span>
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-slate-800">{section.label}</div>
                                    <div className="text-[10px] text-slate-400">{section.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}

                {/* CSV Info */}
                {format === 'csv' && (
                    <div className="p-5">
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                            <div className="flex items-center gap-2 mb-2">
                                <span aria-hidden="true" className="material-symbols-outlined text-emerald-600">info</span>
                                <span className="text-sm font-bold text-emerald-800">CSV Export</span>
                            </div>
                            <p className="text-xs text-emerald-700">
                                Exports ALL pickers with complete data: Sticker ID, Name, Team, Buckets, Hours, Bins/Hr, Piece Rate, Top-Up, Total Earnings, Below Minimum flag. Opens directly in Excel.
                            </p>
                        </div>
                    </div>
                )}

                {/* Action Button */}
                <div className="p-5 pt-0">
                    <button
                        onClick={() => (format === 'pdf' ? onExportPDF(sections) : onExportCSV())}
                        className={`w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${format === 'pdf' ? 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/25' : 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/25'}`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined">download</span>
                        {format === 'pdf' ? 'Generate PDF' : 'Download CSV'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
