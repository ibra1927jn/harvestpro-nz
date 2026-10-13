/**
 * Import CSV Modal
 *
 * 3-step wizard: Upload → Preview → Confirm
 * Imports pickers in bulk from a CSV file.
 */

import React, { useState, useCallback, useRef } from 'react';

import { parseCSV, generateCSVTemplate, type CSVPickerRow, type ParseResult } from '@/utils/csvParser';
import { pickerService } from '@/services/picker.service';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';

interface ImportCSVModalProps {
    isOpen: boolean;
    onClose: () => void;
    orchardId: string;
    existingPickers: Array<{ picker_id: string; name: string }>;
    onImportComplete: (count: number) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportCSVModal({
    isOpen,
    onClose,
    orchardId,
    existingPickers,
    onImportComplete,
}: ImportCSVModalProps) {
    const [step, setStep] = useState<Step>('upload');
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [fileName, setFileName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const reset = useCallback(() => {
        setStep('upload');
        setParseResult(null);
        setImportResult(null);
        setDragActive(false);
        setFileName('');
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    // ========================================
    // FILE HANDLING
    // ========================================

    const processFile = useCallback(async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            showToast('Please select a CSV file (.csv)', 'warning');
            return;
        }

        setFileName(file.name);

        try {
            const result = await parseCSV(file, existingPickers);
            setParseResult(result);
            setStep('preview');
        } catch (err) {
            showToast(`Error parsing CSV: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }, [existingPickers, showToast]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    // ========================================
    // IMPORT
    // ========================================

    const handleImport = useCallback(async () => {
        if (!parseResult?.valid.length) return;
        // 🔧 V23: Prevent double-submit (double-click inserts 2x records)
        if (step === 'importing') return;

        setStep('importing');

        try {
            const result = await pickerService.addPickersBulk(parseResult.valid, orchardId);
            setImportResult(result);
            setStep('done');
            onImportComplete(result.created);
        } catch (err) {
            setImportResult({
                created: 0,
                skipped: parseResult.valid.length,
                errors: [err instanceof Error ? err.message : 'Unknown error'],
            });
            setStep('done');
        }
    }, [parseResult, orchardId, onImportComplete, step]);

    // ========================================
    // TEMPLATE DOWNLOAD
    // ========================================

    const downloadTemplate = useCallback(() => {
        const csv = generateCSVTemplate();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'picker_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    if (!isOpen) return null;

    return (
        <ModalOverlay onClose={handleClose} maxWidth="max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-xl text-primary">group</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-main">Import Pickers</h2>
                        <p className="text-sm text-text-muted">
                            {step === 'upload' && 'Upload a CSV file'}
                            {step === 'preview' && `Preview: ${fileName}`}
                            {step === 'importing' && 'Importing...'}
                            {step === 'done' && 'Import Complete'}
                        </p>
                    </div>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close import modal">
                    <span aria-hidden="true" className="material-symbols-outlined text-xl text-text-muted">close</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 max-h-[60vh]">
                {/* STEP 1: Upload */}
                {step === 'upload' && (
                    <div className="space-y-4">
                        {/* Drop Zone */}
                        <div
                            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragActive
                                ? 'border-primary bg-primary/5'
                                : 'border-border-light hover:border-slate-400'
                                }`}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-5xl mx-auto text-text-muted mb-4">upload</span>
                            <p className="text-text-sub font-medium">
                                Drag & drop your CSV file here
                            </p>
                            <p className="text-sm text-text-muted mt-1">
                                or click to browse
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="hidden"
                                title="Select CSV file"
                            />
                        </div>

                        {/* Template Download */}
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 text-primary hover:text-primary/80 text-sm font-medium"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-base">download</span>
                            Download CSV Template
                        </button>

                        {/* Format Help */}
                        <div className="bg-slate-50 rounded-xl p-4">
                            <p className="text-sm font-medium text-text-sub mb-2">Expected columns:</p>
                            <div className="flex flex-wrap gap-2">
                                {['Name *', 'Email', 'Phone', 'PickerID'].map(col => (
                                    <span key={col} className={`px-3 py-1 rounded-full text-xs font-medium ${col.includes('*') ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-text-sub'
                                        }`}>
                                        {col}
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs text-text-muted mt-2">
                                Column headers are flexible — &quot;Nombre&quot;, &quot;Worker Name&quot;, &quot;Full Name&quot; all work.
                            </p>
                        </div>
                    </div>
                )}

                {/* STEP 2: Preview */}
                {step === 'preview' && parseResult && (
                    <div className="space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <SummaryCard
                                icon={<span aria-hidden="true" className="material-symbols-outlined text-xl text-success">check_circle</span>}
                                label="Ready to import"
                                value={parseResult.valid.length}
                                color="green"
                            />
                            <SummaryCard
                                icon={<span aria-hidden="true" className="material-symbols-outlined text-xl text-warning">warning</span>}
                                label="Duplicates"
                                value={parseResult.duplicates.length}
                                color="yellow"
                            />
                            <SummaryCard
                                icon={<span aria-hidden="true" className="material-symbols-outlined text-xl text-danger">cancel</span>}
                                label="Errors"
                                value={parseResult.errors.length}
                                color="red"
                            />
                        </div>

                        {/* Valid Rows Table */}
                        {parseResult.valid.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-text-sub mb-2">
                                    Pickers to Import ({parseResult.valid.length})
                                </h3>
                                <div className="border border-border-light rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0">
                                            <tr>
                                                <th className="text-left px-4 py-2 text-text-sub">#</th>
                                                <th className="text-left px-4 py-2 text-text-sub">Name</th>
                                                <th className="text-left px-4 py-2 text-text-sub">ID</th>
                                                <th className="text-left px-4 py-2 text-text-sub">Email</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parseResult.valid.map((row: CSVPickerRow, i: number) => (
                                                <tr key={i} className="border-t border-border-light">
                                                    <td className="px-4 py-2 text-text-muted">{i + 1}</td>
                                                    <td className="px-4 py-2 font-medium text-text-main">{row.name}</td>
                                                    <td className="px-4 py-2 text-text-muted">{row.picker_id || '—'}</td>
                                                    <td className="px-4 py-2 text-text-muted">{row.email || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Errors */}
                        {parseResult.errors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-danger mb-2">
                                    Validation Errors ({parseResult.errors.length})
                                </h3>
                                <ul className="space-y-1">
                                    {parseResult.errors.slice(0, 10).map((err, i) => (
                                        <li key={i} className="text-sm text-danger">
                                            Row {err.row}: {err.message}
                                        </li>
                                    ))}
                                    {parseResult.errors.length > 10 && (
                                        <li className="text-sm text-red-500 italic">
                                            ...and {parseResult.errors.length - 10} more
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {/* Duplicates */}
                        {parseResult.duplicates.length > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-warning mb-2">
                                    Skipped Duplicates ({parseResult.duplicates.length})
                                </h3>
                                <ul className="space-y-1">
                                    {parseResult.duplicates.map((dup, i) => (
                                        <li key={i} className="text-sm text-yellow-600">
                                            ID &quot;{dup.picker_id}&quot; already assigned to {dup.existingName}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 3: Importing */}
                {step === 'importing' && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">progress_activity</span>
                        <p className="text-text-sub font-medium">Importing {parseResult?.valid.length || 0} pickers...</p>
                        <p className="text-sm text-text-muted mt-1">This may take a moment</p>
                    </div>
                )}

                {/* STEP 4: Done */}
                {step === 'done' && importResult && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center py-8">
                            {importResult.created > 0 ? (
                                <span aria-hidden="true" className="material-symbols-outlined text-6xl text-success mb-4">check_circle</span>
                            ) : (
                                <span aria-hidden="true" className="material-symbols-outlined text-6xl text-danger mb-4">cancel</span>
                            )}
                            <h3 className="text-xl font-bold text-text-main">
                                {importResult.created > 0 ? 'Import Successful!' : 'Import Failed'}
                            </h3>
                            <p className="text-text-muted mt-1">
                                {importResult.created} created, {importResult.skipped} skipped
                            </p>
                        </div>

                        {importResult.errors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-danger mb-2">Errors</h3>
                                <ul className="space-y-1">
                                    {importResult.errors.map((err, i) => (
                                        <li key={i} className="text-sm text-danger">{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border-light bg-slate-50 rounded-b-2xl">
                <button
                    onClick={step === 'done' ? handleClose : reset}
                    className="px-4 py-2 text-text-sub hover:text-text-main font-medium text-sm transition-colors"
                >
                    {step === 'done' ? 'Close' : 'Cancel'}
                </button>

                {step === 'preview' && parseResult && parseResult.valid.length > 0 && (
                    <button
                        onClick={handleImport}
                        className="px-6 py-2.5 gradient-primary glow-primary text-white rounded-xl font-medium text-sm transition-all flex items-center gap-2 active:scale-95"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">description</span>
                        Import {parseResult.valid.length} Pickers
                    </button>
                )}

                {step === 'done' && importResult && importResult.created > 0 && (
                    <button
                        onClick={handleClose}
                        className="px-6 py-2.5 bg-success text-white rounded-xl font-medium text-sm hover:bg-success/90 transition-colors"
                    >
                        Done
                    </button>
                )}
            </div>
        </ModalOverlay>
    );
}

// ========================================
// HELPER COMPONENTS
// ========================================

function SummaryCard({ icon, label, value, color }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: 'green' | 'yellow' | 'red';
}) {
    const bgColors = { green: 'bg-green-50', yellow: 'bg-yellow-50', red: 'bg-red-50' };

    return (
        <div className={`${bgColors[color]} rounded-xl p-4 text-center`}>
            <div className="flex justify-center mb-2">{icon}</div>
            <div className="text-2xl font-bold text-text-main">{value}</div>
            <div className="text-xs text-text-sub">{label}</div>
        </div>
    );
}
