/**
 * InspectTab — QC Inspection entry tab
 * Extracted from QualityControl.tsx monolith
 *
 * Contains: Picker search, grade buttons, notes input, today's distribution
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { GradeDistribution, QCInspection } from '@/services/qc.service';
import { Picker } from '@/types';
import DistributionBar from './DistributionBar';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useTranslation } from '@/i18n';
import { gradeLabel } from './gradeLabel';
import { matchesInspectQuery, nextForInspection, orderForInspection } from './inspectList';

type QualityGrade = 'A' | 'B' | 'C' | 'reject';

interface GradeConfig {
    label: string;
    sublabel: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
}

// label / sublabel = claves de traducción
const GRADE_CONFIG: Record<QualityGrade, GradeConfig> = {
    A: {
        label: 'panel.quality.grade_a', sublabel: 'qc.export',
        color: 'text-emerald-700', bg: 'bg-emerald-50/50 hover:bg-emerald-50',
        border: 'border border-emerald-200/60 shadow-[0_4px_12px_rgba(16,185,129,0.08)]',
        icon: <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-emerald-500">check_circle</span>,
    },
    B: {
        label: 'panel.quality.grade_b', sublabel: 'qc.domestic',
        color: 'text-blue-700', bg: 'bg-blue-50/50 hover:bg-blue-50',
        border: 'border border-blue-200/60 shadow-[0_4px_12px_rgba(59,130,246,0.08)]',
        icon: <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-blue-500">check_circle</span>,
    },
    C: {
        label: 'panel.quality.grade_c', sublabel: 'qc.process',
        color: 'text-amber-700', bg: 'bg-amber-50/50 hover:bg-amber-50',
        border: 'border border-amber-200/60 shadow-[0_4px_12px_rgba(245,158,11,0.08)]',
        icon: <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-amber-500">warning</span>,
    },
    reject: {
        label: 'qc.reject', sublabel: 'qc.discard',
        color: 'text-red-700', bg: 'bg-red-50/50 hover:bg-red-50',
        border: 'border border-red-200/60 shadow-[0_4px_12px_rgba(239,68,68,0.08)]',
        icon: <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-red-500">cancel</span>,
    },
};

interface InspectTabProps {
    crew: Picker[];
    /** Inspecciones de hoy: marcan a quién ya se ha inspeccionado */
    inspections: QCInspection[];
    distribution: GradeDistribution;
    selectedPicker: Picker | null;
    setSelectedPicker: (p: Picker | null) => void;
    notes: string;
    setNotes: (n: string) => void;
    isSubmitting: boolean;
    lastGrade: { grade: QualityGrade; picker: string } | null;
    /** Fallo al guardar la última inspección */
    gradeError?: string | null;
    onGrade: (grade: QualityGrade, photoBlob?: Blob | null) => Promise<boolean> | void;
}

/** Espera antes del avance automático en Turbo: da tiempo a ver el aviso y a cancelarlo */
const TURBO_ADVANCE_MS = 300;

export default function InspectTab({
    crew, inspections, distribution, selectedPicker, setSelectedPicker,
    notes, setNotes, isSubmitting, lastGrade, gradeError, onGrade,
}: InspectTabProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [turboMode, setTurboMode] = React.useState(false);
    const [showAll, setShowAll] = React.useState(false);
    const { capturePhoto, photoBlob, photoPreview, isCapturing, clearPhoto } = usePhotoCapture();

    // Lista: solo pickers, fichados primero, por fila; con la marca de «ya inspeccionado hoy»
    const inspectedIds = useMemo(() => new Set(inspections.map(i => i.picker_id)), [inspections]);
    const ordered = useMemo(() => orderForInspection(crew, inspectedIds), [crew, inspectedIds]);
    const presentCount = useMemo(() => ordered.filter(e => e.present).length, [ordered]);
    // Sin búsqueda: los fichados hoy (todos si no hay nadie fichado o si se pidió «ver todos»)
    const baseList = useMemo(
        () => (showAll || presentCount === 0 ? ordered : ordered.filter(e => e.present)),
        [ordered, showAll, presentCount],
    );
    const isSearching = searchQuery.trim().length > 0;
    const visible = useMemo(
        () => (isSearching ? ordered.filter(e => matchesInspectQuery(e.picker, searchQuery)) : baseList),
        [isSearching, ordered, searchQuery, baseList],
    );
    const hiddenCount = ordered.length - baseList.length;
    const canToggleAll = !isSearching && presentCount > 0 && presentCount < ordered.length;

    // Avance automático (Turbo): recorre la lista que se ve, saltando a los ya inspeccionados
    const listRef = useRef(baseList);
    listRef.current = baseList;
    const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelAdvance = () => {
        if (advanceTimer.current) {
            clearTimeout(advanceTimer.current);
            advanceTimer.current = null;
        }
    };
    useEffect(() => () => {
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
    }, []);

    // Tocar al seleccionado lo deselecciona (y cancela el avance pendiente del Turbo)
    const togglePicker = (picker: Picker) => {
        cancelAdvance();
        setSelectedPicker(selectedPicker?.id === picker.id ? null : picker);
    };

    // Turbo mode: wrap onGrade to add haptic + auto-advance
    const handleTurboGrade = async (grade: QualityGrade) => {
        if (!selectedPicker) return;
        const currentId = selectedPicker.id;
        // Haptic feedback
        if (turboMode && navigator.vibrate) {
            navigator.vibrate(50); // short pulse
        }
        const saved = await onGrade(grade, photoBlob);
        // Si no se guardó, se queda en el mismo picker (y la foto) para reintentar
        if (saved === false) return;
        clearPhoto();
        if (turboMode) {
            cancelAdvance();
            advanceTimer.current = setTimeout(() => {
                advanceTimer.current = null;
                setSelectedPicker(nextForInspection(listRef.current, currentId));
            }, TURBO_ADVANCE_MS);
        }
    };

    return (
        <div className="space-y-5 px-1 py-1">
            {/* Turbo Mode Toggle */}
            <div className="flex items-center justify-between bg-gradient-to-r from-orange-50/80 to-amber-50/80 backdrop-blur-md border border-orange-200/60 shadow-[0_4px_20px_rgb(249,115,22,0.05)] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-orange-100 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-orange-500">bolt</span>
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-orange-900 tracking-tight">{t('qc.turbo')}</p>
                        <p className="text-[10px] font-bold text-orange-600/80 uppercase tracking-widest mt-0.5">{t('qc.turbo_desc')}</p>
                    </div>
                </div>
                <button
                    onClick={() => setTurboMode(!turboMode)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 ${turboMode ? 'bg-orange-500' : 'bg-slate-200'}`}
                    role="switch"
                    aria-checked={turboMode ? "true" : "false"}
                    aria-label={t('qc.turbo_toggle')}
                >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${turboMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
            </div>
            {gradeError && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-red-600">error</span>
                    <span className="text-sm text-red-800">{gradeError}</span>
                </div>
            )}
            {/* Success Toast */}
            {lastGrade && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-green-600">check_circle</span>
                    <span className="text-sm text-green-800">
                        {t('qc.logged_for', { name: lastGrade.picker }).split('{grade}')[0]}
                        <strong>{gradeLabel(t, lastGrade.grade)}</strong>
                        {t('qc.logged_for', { name: lastGrade.picker }).split('{grade}')[1] ?? ''}
                    </span>
                </div>
            )}

            {/* Step 1: Picker Selection */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                
                <div className="px-5 py-4 border-b border-slate-100/50">
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">{t('qc.step1')}</h2>
                </div>
                
                <div className="p-5 space-y-4">
                    <div className="relative">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                        <input
                            type="text"
                            placeholder={t('qc.search_placeholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label={t('qc.search_label')}
                            className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5 max-h-72 overflow-y-auto no-scrollbar" role="list">
                        {visible.map(({ picker, present, inspected }) => {
                            const isSelected = selectedPicker?.id === picker.id;
                            return (
                                <div
                                    key={picker.id}
                                    role="listitem"
                                    className={`flex items-center gap-1 rounded-2xl transition-all duration-300 ${isSelected
                                        ? 'bg-orange-50 border border-orange-200/60 shadow-[0_4px_12px_rgb(249,115,22,0.05)]'
                                        : 'border border-transparent hover:bg-slate-50'
                                        }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => togglePicker(picker)}
                                        aria-pressed={isSelected}
                                        className="flex-1 min-w-0 flex items-center gap-4 px-4 py-3 min-h-[56px] rounded-2xl text-left"
                                    >
                                        <div className={`size-10 rounded-xl flex items-center justify-center text-xs font-black uppercase ${present ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-300'}`}>
                                            {picker.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-extrabold truncate mb-0.5 ${present ? 'text-slate-800' : 'text-slate-400'}`}>
                                                {picker.name}
                                                <span className="ml-2 text-[10px] font-bold text-slate-400 tracking-widest">{t('qc.id_n', { id: picker.picker_id })}</span>
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-slate-100">
                                                    {t('runner.row_n', { n: picker.current_row })}
                                                </span>
                                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-md border border-primary/10">
                                                    {t('qc.bkt_n', { n: picker.total_buckets_today })}
                                                </span>
                                                {inspected && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[12px]">task_alt</span>
                                                        {t('qc.inspected_today')}
                                                    </span>
                                                )}
                                                {!present && (
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                                        {t('qc.not_checked_in')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-orange-500 drop-shadow-sm">check_circle</span>
                                        )}
                                    </button>
                                    {isSelected && (
                                        <button
                                            type="button"
                                            onClick={() => togglePicker(picker)}
                                            aria-label={t('qc.deselect')}
                                            className="size-11 mr-1 shrink-0 flex items-center justify-center rounded-xl text-slate-500 hover:bg-orange-100 hover:text-orange-700 active:scale-95 transition-all"
                                        >
                                            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">close</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {visible.length === 0 && (
                            <p className="text-[11px] font-bold text-slate-400 text-center py-6 uppercase tracking-widest">{t('qc.no_pickers')}</p>
                        )}
                    </div>
                    {canToggleAll && (
                        <button
                            type="button"
                            onClick={() => setShowAll(v => !v)}
                            className="w-full min-h-[44px] px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all active:scale-[0.98]"
                        >
                            {showAll ? t('qc.show_present_only') : t('qc.show_all_n', { n: hiddenCount })}
                        </button>
                    )}
                </div>
            </div>

            {/* Step 2: Grade Entry */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="px-5 py-4 border-b border-slate-100/50 flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">
                        {t('qc.step2')}
                    </h2>
                    {selectedPicker && (
                        <span className="text-[10px] bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg text-slate-500 font-bold uppercase tracking-widest">
                            {t('qc.for_name', { name: selectedPicker.name })}
                        </span>
                    )}
                </div>
                <div className="p-5">
                    <div className={turboMode ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                        {(Object.entries(GRADE_CONFIG) as [QualityGrade, GradeConfig][]).map(
                            ([grade, config]) => (
                                <button
                                    key={grade}
                                    onClick={() => handleTurboGrade(grade)}
                                    disabled={!selectedPicker || isSubmitting}
                                    className={`${config.bg} ${config.border} rounded-2xl ${turboMode ? 'p-6' : 'p-4'} flex items-center gap-4 
                                        transition-all duration-300
                                        ${!selectedPicker ? 'opacity-40 cursor-not-allowed grayscale' : 'active:scale-95'}
                                        ${isSubmitting ? 'pointer-events-none' : ''}`}
                                >
                                    <span className={turboMode ? 'scale-125' : ''}>{config.icon}</span>
                                    <div className="text-left flex-1">
                                        <div className={`font-extrabold tracking-tight ${turboMode ? 'text-lg' : 'text-sm'} ${config.color}`}>
                                            {t(config.label)}
                                        </div>
                                        <div className={`${turboMode ? 'text-sm' : 'text-[11px] uppercase tracking-widest'} text-slate-500 font-bold mt-0.5`}>{t(config.sublabel)}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                                            {t('qc.n_today', { n: distribution[grade as keyof Omit<GradeDistribution, 'total'>] })}
                                        </div>
                                    </div>
                                    {turboMode && selectedPicker && (
                                        <div className="size-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-slate-300">touch_app</span>
                                        </div>
                                    )}
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Step 3: Notes (optional) */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="px-5 py-4 border-b border-slate-100/50">
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">{t('qc.step3')} <span className="font-normal text-slate-400 text-xs ml-1">{t('qc.optional')}</span></h2>
                </div>
                <div className="p-5 space-y-4">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('qc.notes_placeholder')}
                        aria-label={t('qc.notes_label')}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-medium text-slate-800 resize-none focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all placeholder:text-slate-400"
                    />
                    <button
                        type="button"
                        onClick={capturePhoto}
                        disabled={isCapturing}
                        className="w-full flex justify-center items-center gap-2 px-4 py-3.5 text-[12px] uppercase tracking-widest font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 hover:text-slate-800 transition-all shadow-sm disabled:opacity-50 active:scale-[0.98]"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            {isCapturing ? 'hourglass_empty' : 'photo_camera'}
                        </span>
                        {isCapturing ? t('qc.processing') : t('qc.attach_photo')}
                    </button>
                    {photoPreview && (
                        <div className="relative inline-block mt-2">
                            <img
                                src={photoPreview}
                                alt={t('qc.photo_alt')}
                                className="w-28 h-28 object-cover rounded-2xl border-4 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                            />
                            <button
                                type="button"
                                onClick={clearPhoto}
                                className="absolute -top-3 -right-3 size-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 hover:scale-110 transition-all active:scale-95"
                                aria-label={t('qc.remove_photo')}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Today's Stats */}
            {distribution.total > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden p-5">
                    <h3 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">{t('qc.today_distribution')}</h3>
                    <DistributionBar distribution={distribution} />
                    <div className="flex justify-between mt-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                        <span>A: {distribution.A} <span className="font-medium text-slate-400 ml-0.5">({distribution.total ? Math.round(distribution.A / distribution.total * 100) : 0}%)</span></span>
                        <span>B: {distribution.B} <span className="font-medium text-slate-400 ml-0.5">({distribution.total ? Math.round(distribution.B / distribution.total * 100) : 0}%)</span></span>
                        <span>C: {distribution.C} <span className="font-medium text-slate-400 ml-0.5">({distribution.total ? Math.round(distribution.C / distribution.total * 100) : 0}%)</span></span>
                        <span>R: {distribution.reject} <span className="font-medium text-slate-400 ml-0.5">({distribution.total ? Math.round(distribution.reject / distribution.total * 100) : 0}%)</span></span>
                    </div>
                </div>
            )}
        </div>
    );
}
