/**
 * Import CSV Modal
 *
 * 3-step wizard: Upload → Preview → Confirm
 * Imports pickers in bulk from a CSV file.
 */

import React, { useState, useCallback } from 'react';

import { parseCSV, generateCSVTemplate, type ParseResult } from '@/utils/csvParser';
import { pickerService } from '@/services/picker.service';
import { useToast } from '@/hooks/useToast';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { failedImport, isCsvFileName, stepSubtitle, type ImportResult, type ImportStep } from './import-csv/importCsvLogic';
import { DoneStep, ImportingStep, PreviewStep, UploadStep } from './import-csv/ImportSteps';

interface ImportCSVModalProps {
    isOpen: boolean;
    onClose: () => void;
    orchardId: string;
    existingPickers: Array<{ picker_id: string; name: string }>;
    onImportComplete: (count: number) => void;
}

type Step = ImportStep;

export default function ImportCSVModal({
    isOpen,
    onClose,
    orchardId,
    existingPickers,
    onImportComplete,
}: ImportCSVModalProps) {
    const [step, setStep] = useState<Step>('upload');
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [fileName, setFileName] = useState('');
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
        if (!isCsvFileName(file.name)) {
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
            setImportResult(failedImport(parseResult.valid.length, err));
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
                        <span className="material-symbols-outlined text-xl text-primary">group</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-main">Import Pickers</h2>
                        <p className="text-sm text-text-muted">
                            {stepSubtitle(step, fileName)}
                        </p>
                    </div>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close import modal">
                    <span className="material-symbols-outlined text-xl text-text-muted">close</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 max-h-[60vh]">
                {step === 'upload' && (
                    <UploadStep
                        dragActive={dragActive}
                        onDragActiveChange={setDragActive}
                        onDrop={handleDrop}
                        onFileSelect={handleFileSelect}
                        onDownloadTemplate={downloadTemplate}
                    />
                )}
                {step === 'preview' && parseResult && <PreviewStep parseResult={parseResult} />}
                {step === 'importing' && <ImportingStep count={parseResult?.valid.length || 0} />}
                {step === 'done' && importResult && <DoneStep importResult={importResult} />}
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
                        <span className="material-symbols-outlined text-base">description</span>
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
