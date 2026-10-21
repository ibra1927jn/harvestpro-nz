/**
 * HistoryTab — QC Inspection History
 * Extracted from QualityControl.tsx monolith
 *
 * Lista de inspecciones del día (nota, criterios con aviso, foto) y, solo para
 * team leader / manager / RRHH / admin, la sección «Bienestar» con las personas
 * que dijeron no estar informadas o no estar a gusto en el equipo.
 */
import { useState, useMemo, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import EmptyState from '@/components/ui/EmptyState';
import FilterBar from '@/components/ui/FilterBar';
import VirtualList from '@/components/ui/VirtualList';
import { QCInspection } from '@/services/qc.service';
import { Picker } from '@/types';
import { useTranslation } from '@/i18n';
import { formatNZTime } from '@/utils/nzFormat';
import { useQcPhotoUrl } from '@/hooks/useQcPhotoUrl';
import { gradeLabel, gradeLetter, type QCGrade } from './gradeLabel';
import { markedCriteria, normalizeCriteria } from '@/services/qcCriteria';

const GRADE_PILL_COLORS: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-blue-100 text-blue-700',
    C: 'bg-amber-100 text-amber-700',
    reject: 'bg-red-100 text-red-700',
};

/** Miniatura de la foto (bucket privado: enlace firmado) */
function QcThumb({ stored, alt }: { stored: string; alt: string }) {
    const src = useQcPhotoUrl(stored);
    if (!src) return <span className="block w-10 h-10 rounded border border-border-light bg-slate-100" aria-hidden="true" />;
    return (
        <img
            src={src}
            alt={alt}
            className="w-10 h-10 object-cover rounded border border-border-light hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
        />
    );
}

/** Criterios en regular (ámbar) o mal (rojo) de una inspección, como chips */
function CriteriaChips({ criteria, t }: { criteria: unknown; t: (k: string) => string }) {
    const flagged = markedCriteria(normalizeCriteria(criteria)).filter(([, state]) => state !== 'ok');
    if (flagged.length === 0) return null;
    return (
        <span className="flex flex-wrap gap-1 mt-0.5">
            {flagged.map(([key, state]) => (
                <span
                    key={key}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${state === 'bad' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                >
                    {t(`qc.crit.${key}`)}
                </span>
            ))}
        </span>
    );
}

interface HistoryTabProps {
    inspections: QCInspection[];
    crew: Picker[];
    /** Solo team leader, manager, RRHH y admin ven la sección de bienestar */
    canViewWellbeing?: boolean;
}

export default function HistoryTab({ inspections, crew, canViewWellbeing = false }: HistoryTabProps) {
    const { t } = useTranslation();
    const pickerName = (id: string) => crew.find(p => p.id === id)?.name || t('common.unknown');

    // Bienestar: respuestas «no» a informado / a gusto (fuera de la nota y de las estadísticas)
    // TODO: aviso al team leader («N pickers de tu equipo dicen no estar informados») — fuera de alcance aquí.
    const wellbeingFlags = useMemo(
        () => (canViewWellbeing ? inspections.filter(i => i.informed === false || i.comfortable === false) : []),
        [inspections, canViewWellbeing],
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const lightboxRef = useRef<HTMLDivElement>(null);
    useDialogA11y(lightboxRef, { onClose: () => setLightboxUrl(null), enabled: !!lightboxUrl });
    const lightboxSrc = useQcPhotoUrl(lightboxUrl);

    const gradeOptions = useMemo(() =>
        [...new Set(inspections.map(i => i.grade))].sort(),
        [inspections]
    );

    const filtered = useMemo(() => inspections.filter(insp => {
        const picker = crew.find(p => p.id === insp.picker_id);
        const matchesSearch = !searchQuery ||
            (picker?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesGrade = !activeFilters.grade || insp.grade === activeFilters.grade;
        return matchesSearch && matchesGrade;
    }), [inspections, crew, searchQuery, activeFilters]);

    return (
        <>
            {canViewWellbeing && (
                <section
                    className="bg-white rounded-lg border border-border-light shadow-sm mb-4"
                    aria-label={t('qc.wellbeing_title')}
                    data-testid="wellbeing-section"
                >
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-text-main flex items-center gap-2">
                            <span aria-hidden="true" className="material-symbols-outlined text-base text-rose-500">favorite</span>
                            {t('qc.wellbeing_title')}
                        </h2>
                        <span className="text-xs text-text-muted">{t('qc.wellbeing_n', { n: wellbeingFlags.length })}</span>
                    </div>
                    {wellbeingFlags.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-text-muted">{t('qc.wellbeing_empty')}</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {wellbeingFlags.map(insp => (
                                <li key={insp.id} className="px-4 py-3 flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-text-main truncate">{pickerName(insp.picker_id)}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {insp.informed === false && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">{t('qc.flag_not_informed')}</span>
                                            )}
                                            {insp.comfortable === false && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">{t('qc.flag_not_comfortable')}</span>
                                            )}
                                        </div>
                                        {insp.wellbeing_notes && (
                                            <p className="text-xs text-text-muted mt-1">{insp.wellbeing_notes}</p>
                                        )}
                                    </div>
                                    <span className="text-xs text-text-muted">{formatNZTime(insp.created_at)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
            <div className="bg-white rounded-lg border border-border-light shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-text-main mb-3">
                        {t('qc.recent_n', { n: filtered.length })}
                    </h2>
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchPlaceholder={t('qc.search_by_picker')}
                        filters={[
                            { key: 'grade', label: t('qc.grade'), options: gradeOptions, icon: 'grade' },
                        ]}
                        activeFilters={activeFilters}
                        onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                        onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
                    />
                </div>
                {filtered.length > 0 ? (
                    <VirtualList
                        items={filtered}
                        estimateSize={76}
                        overscan={8}
                        className="max-h-[500px]"
                        getKey={(item) => item.id}
                        renderItem={(insp) => {
                            const picker = crew.find(p => p.id === insp.picker_id);
                            return (
                                <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-medium text-text-sub">
                                        {picker?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-text-main truncate">
                                            {picker?.name || t('common.unknown')}
                                            {insp.row_number ? (
                                                <span className="ml-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">{t('runner.row_n', { n: insp.row_number })}</span>
                                            ) : null}
                                        </p>
                                        {insp.notes && (
                                            <p className="text-xs text-text-muted truncate">{insp.notes}</p>
                                        )}
                                        <CriteriaChips criteria={insp.criteria} t={t} />
                                    </div>
                                    {insp.photo_url && (
                                        <button
                                            type="button"
                                            onClick={() => setLightboxUrl(insp.photo_url!)}
                                            className="flex-shrink-0"
                                            aria-label={t('qc.view_photo')}
                                        >
                                            <QcThumb stored={insp.photo_url} alt={t('qc.photo_alt')} />
                                        </button>
                                    )}
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${GRADE_PILL_COLORS[insp.grade] || ''}`}
                                        title={gradeLabel(t, insp.grade as QCGrade)}
                                        aria-label={gradeLabel(t, insp.grade as QCGrade)}
                                    >
                                        {gradeLetter(t, insp.grade as QCGrade)}
                                    </span>
                                    <span className="text-xs text-text-muted">
                                        {formatNZTime(insp.created_at)}
                                    </span>
                                </div>
                            );
                        }}
                    />
                ) : (
                    <EmptyState
                        icon="assignment_turned_in"
                        title={t('qc.no_inspections')}
                        subtitle={searchQuery || Object.values(activeFilters).some(v => v) ? t('qc.adjust_filters') : t('qc.start_inspecting')}
                        compact
                    />
                )}
            </div>

            {/* Lightbox overlay */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightboxUrl(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('qc.photo_preview')}
                    ref={lightboxRef}
                >
                    <div className="relative max-w-2xl max-h-[80vh]">
                        <img
                            src={lightboxSrc ?? undefined}
                            alt={t('qc.photo_alt')}
                            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            type="button"
                            onClick={() => setLightboxUrl(null)}
                            className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                            aria-label={t('qc.close_preview')}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-text-sub">close</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
