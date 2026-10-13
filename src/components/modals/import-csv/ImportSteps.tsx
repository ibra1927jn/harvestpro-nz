/**
 * Pasos del asistente de importación CSV (marcado movido sin cambios desde ImportCSVModal).
 * @module components/modals/import-csv/ImportSteps
 */
import React, { useRef } from 'react';
import type { CSVPickerRow, ParseResult } from '@/utils/csvParser';
import { splitVisible, type ImportResult } from './importCsvLogic';

export function UploadStep({ dragActive, onDragActiveChange, onDrop, onFileSelect, onDownloadTemplate }: {
    dragActive: boolean;
    onDragActiveChange: (active: boolean) => void;
    onDrop: (e: React.DragEvent) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDownloadTemplate: () => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="space-y-4">
            {/* Drop Zone */}
            <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border-light hover:border-slate-400'
                    }`}
                onDragOver={(e) => { e.preventDefault(); onDragActiveChange(true); }}
                onDragLeave={() => onDragActiveChange(false)}
                onDrop={onDrop}
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
                    onChange={onFileSelect}
                    className="hidden"
                    title="Select CSV file"
                />
            </div>

            {/* Template Download */}
            <button
                onClick={onDownloadTemplate}
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
    );
}

export function PreviewStep({ parseResult }: { parseResult: ParseResult }) {
    const { shown: shownErrors, hidden: hiddenErrors } = splitVisible(parseResult.errors);
    return (
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
                        {shownErrors.map((err, i) => (
                            <li key={i} className="text-sm text-danger">
                                Row {err.row}: {err.message}
                            </li>
                        ))}
                        {hiddenErrors > 0 && (
                            <li className="text-sm text-red-500 italic">
                                ...and {hiddenErrors} more
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
    );
}

export function ImportingStep({ count }: { count: number }) {
    return (
        <div className="flex flex-col items-center justify-center py-16">
            <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">progress_activity</span>
            <p className="text-text-sub font-medium">Importing {count} pickers...</p>
            <p className="text-sm text-text-muted mt-1">This may take a moment</p>
        </div>
    );
}

export function DoneStep({ importResult }: { importResult: ImportResult }) {
    return (
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
    );
}

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
