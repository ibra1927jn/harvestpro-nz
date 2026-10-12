/**
 * DocumentsTab — HR Document Management (LIVE, not stub)
 *
 * Implementado 2026-04-18:
 * - Lista docs del orchard activo desde hr_documents table (RLS hr_admin/admin/manager)
 * - Upload a bucket privado "hr-documents" con path orchard_id/doc_type/ts-name
 * - Badge de expiration (rojo si < 0 días, amber si < 60d)
 * - Delete con confirmation (soft-delete + storage cleanup)
 * - Download via signed URL (5 min expiry)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
    hrDocumentsRepository,
    HR_DOCUMENT_TYPE_LABELS,
    type HRDocumentRow,
    type HRDocumentType,
} from '@/repositories/hr-documents.repository';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { logger } from '@/utils/logger';
import { userRepository2, type StaffMember } from '@/repositories/user.repository';
import { useAuth } from '@/context/AuthContext';

function daysUntil(iso: string | null): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    return Math.ceil(ms / (24 * 3600 * 1000));
}

function formatBytes(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const DocumentsTab: React.FC = () => {
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const [docs, setDocs] = useState<HRDocumentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    // Plantilla de la empresa: a quién pertenece cada documento
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const nameOf = (d: HRDocumentRow) =>
        staff.find(s => s.id === (d.picker_id || d.user_id))?.full_name ?? '—';

    const reload = useCallback(async () => {
        if (!orchardId) return;
        setLoading(true);
        try {
            // RRHH trabaja con toda la empresa (la gente rota entre huertos)
            const [rows, people] = await Promise.all([
                hrDocumentsRepository.listAll(),
                userRepository2.getStaff().catch(() => [] as StaffMember[]),
            ]);
            setDocs(rows);
            setStaff(people);
            setErr(null);
        } catch (e) {
            logger.error('[DocumentsTab] load failed:', e);
            setErr(e instanceof Error ? e.message : 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [orchardId]);

    useEffect(() => {
        reload();
    }, [reload]);

    const handleDelete = async (doc: HRDocumentRow) => {
        if (!confirm(`Eliminar "${doc.title}"?`)) return;
        try {
            await hrDocumentsRepository.softDelete(doc.id, doc.storage_path);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
        } catch (e) {
            logger.error('[DocumentsTab] delete failed:', e);
            setErr(e instanceof Error ? e.message : 'Delete failed');
        }
    };

    const handleDownload = async (doc: HRDocumentRow) => {
        try {
            const url = await hrDocumentsRepository.getSignedUrl(doc.storage_path);
            window.open(url, '_blank');
        } catch (e) {
            logger.error('[DocumentsTab] download failed:', e);
            setErr(e instanceof Error ? e.message : 'Download failed');
        }
    };

    if (!orchardId) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-amber-800">Selecciona un orchard primero.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {err && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-800 text-sm">
                    {err}
                </div>
            )}

            {/* Upload panel */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-border-light">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-text-primary mb-1">Document Storage</h3>
                        <p className="text-sm text-text-secondary">Contratos, visas, certificados</p>
                    </div>
                    <button
                        data-testid="hr-docs-upload-btn"
                        onClick={() => setUploadOpen(true)}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors"
                    >
                        <span className="material-symbols-outlined text-base align-middle mr-1">cloud_upload</span>
                        Upload
                    </button>
                </div>
            </div>

            {loading && (
                <div data-testid="hr-docs-loading" className="text-center py-8 text-text-secondary">Loading…</div>
            )}

            {!loading && docs.length === 0 && (
                <div data-testid="hr-docs-empty" className="bg-slate-50 rounded-xl p-8 text-center border border-dashed border-slate-200">
                    <span className="material-symbols-outlined text-5xl text-slate-300 mb-2 block">folder_open</span>
                    <p className="text-sm text-text-secondary">No hay documentos subidos todavía.</p>
                </div>
            )}

            {!loading && docs.length > 0 && (
                <div data-testid="hr-docs-list" className="space-y-2">
                    {docs.map(doc => {
                        const days = daysUntil(doc.expires_at);
                        const expBadge =
                            days === null ? null :
                            days < 0 ? <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Vencido {Math.abs(days)}d</span> :
                            days < 60 ? <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Expira en {days}d</span> :
                            <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">OK</span>;
                        return (
                            <div key={doc.id} data-testid={`hr-doc-${doc.id}`} className="bg-white rounded-xl p-4 shadow-sm border border-border-light flex items-center gap-3">
                                <div className="size-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-indigo-600">description</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-text-primary text-sm truncate">
                                        {doc.title}
                                        {expBadge}
                                    </h4>
                                    <p className="text-xs text-text-secondary">
                                        {nameOf(doc)} · {HR_DOCUMENT_TYPE_LABELS[doc.document_type]} · {formatBytes(doc.file_size_bytes)}
                                    </p>
                                </div>
                                <button
                                    data-testid={`hr-doc-download-${doc.id}`}
                                    onClick={() => handleDownload(doc)}
                                    className="text-indigo-600 hover:text-indigo-800 p-1"
                                    title="Descargar"
                                >
                                    <span className="material-symbols-outlined">download</span>
                                </button>
                                <button
                                    data-testid={`hr-doc-delete-${doc.id}`}
                                    onClick={() => handleDelete(doc)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="Eliminar"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {uploadOpen && (
                <UploadModal
                    orchardId={orchardId}
                    staff={staff}
                    onClose={() => setUploadOpen(false)}
                    onUploaded={() => {
                        setUploadOpen(false);
                        reload();
                    }}
                />
            )}
        </div>
    );
};

// ── Upload Modal ─────────────────────────────────────────

interface UploadModalProps {
    orchardId: string;
    staff: StaffMember[];
    onClose: () => void;
    onUploaded: () => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ orchardId, staff, onClose, onUploaded }) => {
    const { appUser } = useAuth();
    const [personId, setPersonId] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [docType, setDocType] = useState<HRDocumentType>('employment_agreement');
    const [expiresAt, setExpiresAt] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const handleSubmit = async () => {
        const person = staff.find(s => s.id === personId);
        if (!person || !file || !title.trim()) {
            setErr('Employee, file and title are required');
            return;
        }
        setUploading(true);
        setErr(null);
        try {
            await hrDocumentsRepository.upload(file, {
                // Huerto de la persona (o el activo); plantilla → picker_id, oficina → user_id
                orchardId: person.orchard_id || orchardId,
                pickerId: person.source === 'staff' ? person.id : null,
                userId: person.source === 'office' ? person.id : null,
                uploadedBy: appUser?.id ?? null,
                documentType: docType,
                title: title.trim(),
                expiresAt: expiresAt || null,
                notes: notes.trim() || null,
            });
            onUploaded();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                <h3 className="font-bold text-lg">Subir documento</h3>

                {err && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2">{err}</div>}

                <label className="block">
                    <span className="text-sm font-medium">Employee</span>
                    <select
                        data-testid="upload-person"
                        value={personId}
                        onChange={e => setPersonId(e.target.value)}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                        <option value="">Choose a person…</option>
                        {[...staff].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(s => (
                            <option key={s.id} value={s.id}>{s.full_name}{s.code ? ` (${s.code})` : ''}</option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="text-sm font-medium">Archivo</span>
                    <input
                        data-testid="upload-file"
                        type="file"
                        onChange={e => setFile(e.target.files?.[0] ?? null)}
                        className="mt-1 block w-full text-sm"
                    />
                </label>

                <label className="block">
                    <span className="text-sm font-medium">Título</span>
                    <input
                        data-testid="upload-title"
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                </label>

                <label className="block">
                    <span className="text-sm font-medium">Tipo</span>
                    <select
                        data-testid="upload-type"
                        value={docType}
                        onChange={e => setDocType(e.target.value as HRDocumentType)}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                        {Object.entries(HR_DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="text-sm font-medium">Vence (opcional)</span>
                    <input
                        data-testid="upload-expires"
                        type="date"
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                </label>

                <label className="block">
                    <span className="text-sm font-medium">Notas</span>
                    <textarea
                        data-testid="upload-notes"
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value.slice(0, 500))}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                </label>

                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onClose}
                        disabled={uploading}
                        className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        data-testid="upload-submit"
                        onClick={handleSubmit}
                        disabled={uploading}
                        className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
                    >
                        {uploading ? 'Subiendo…' : 'Subir'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DocumentsTab;
