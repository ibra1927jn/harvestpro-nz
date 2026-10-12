/**
 * InspectTab — QC Inspection entry tab
 * Extracted from QualityControl.tsx monolith
 *
 * Contains: Picker search, grade buttons, notes input, today's distribution
 */
import React, { useMemo } from 'react';
import { GradeDistribution } from '@/services/qc.service';
import { Picker } from '@/types';
import DistributionBar from './DistributionBar';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';

type QualityGrade = 'A' | 'B' | 'C' | 'reject';

interface GradeConfig {
    label: string;
    sublabel: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
}

const GRADE_CONFIG: Record<QualityGrade, GradeConfig> = {
    A: {
        label: 'Grade A', sublabel: 'Export',
        color: 'text-emerald-700', bg: 'bg-emerald-50/50 hover:bg-emerald-50',
        border: 'border border-emerald-200/60 shadow-[0_4px_12px_rgba(16,185,129,0.08)]',
        icon: <span className="material-symbols-outlined text-[20px] text-emerald-500">check_circle</span>,
    },
    B: {
        label: 'Grade B', sublabel: 'Domestic',
        color: 'text-blue-700', bg: 'bg-blue-50/50 hover:bg-blue-50',
        border: 'border border-blue-200/60 shadow-[0_4px_12px_rgba(59,130,246,0.08)]',
        icon: <span className="material-symbols-outlined text-[20px] text-blue-500">check_circle</span>,
    },
    C: {
        label: 'Grade C', sublabel: 'Process',
        color: 'text-amber-700', bg: 'bg-amber-50/50 hover:bg-amber-50',
        border: 'border border-amber-200/60 shadow-[0_4px_12px_rgba(245,158,11,0.08)]',
        icon: <span className="material-symbols-outlined text-[20px] text-amber-500">warning</span>,
    },
    reject: {
        label: 'Reject', sublabel: 'Discard',
        color: 'text-red-700', bg: 'bg-red-50/50 hover:bg-red-50',
        border: 'border border-red-200/60 shadow-[0_4px_12px_rgba(239,68,68,0.08)]',
        icon: <span className="material-symbols-outlined text-[20px] text-red-500">cancel</span>,
    },
};

interface InspectTabProps {
    crew: Picker[];
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
    /** If provided, called after a successful grade to auto-select next */
    onAutoAdvance?: () => void;
}

export default function InspectTab({
    crew, distribution, selectedPicker, setSelectedPicker,
    notes, setNotes, isSubmitting, lastGrade, gradeError, onGrade, onAutoAdvance,
}: InspectTabProps) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [turboMode, setTurboMode] = React.useState(false);
    const { capturePhoto, photoBlob, photoPreview, isCapturing, clearPhoto } = usePhotoCapture();

    const filteredPickers = useMemo(() => {
        if (!searchQuery.trim()) return crew.slice(0, 5);
        const q = searchQuery.toLowerCase();
        return crew.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.picker_id.toLowerCase().includes(q)
        );
    }, [crew, searchQuery]);

    // Turbo mode: wrap onGrade to add haptic + auto-advance
    const handleTurboGrade = async (grade: QualityGrade) => {
        // Haptic feedback
        if (turboMode && navigator.vibrate) {
            navigator.vibrate(50); // short pulse
        }
        const saved = await onGrade(grade, photoBlob);
        // Si no se guardó, se queda en el mismo picker (y la foto) para reintentar
        if (saved === false) return;
        clearPhoto();
        if (turboMode && onAutoAdvance) {
            // Small delay so the success toast renders before advancing
            setTimeout(() => onAutoAdvance(), 300);
        }
    };

    return (
        <div className="space-y-5 px-1 py-1">
            {/* Turbo Mode Toggle */}
            <div className="flex items-center justify-between bg-gradient-to-r from-orange-50/80 to-amber-50/80 backdrop-blur-md border border-orange-200/60 shadow-[0_4px_20px_rgb(249,115,22,0.05)] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-orange-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px] text-orange-500">bolt</span>
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-orange-900 tracking-tight">Turbo Mode</p>
                        <p className="text-[10px] font-bold text-orange-600/80 uppercase tracking-widest mt-0.5">Auto-advance + haptic + max buttons</p>
                    </div>
                </div>
                <button
                    onClick={() => setTurboMode(!turboMode)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 ${turboMode ? 'bg-orange-500' : 'bg-slate-200'}`}
                    role="switch"
                    aria-checked={turboMode ? "true" : "false"}
                    aria-label="Toggle turbo mode"
                >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${turboMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
            </div>
            {gradeError && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-red-600">error</span>
                    <span className="text-sm text-red-800">{gradeError}</span>
                </div>
            )}
            {/* Success Toast */}
            {lastGrade && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-green-600">check_circle</span>
                    <span className="text-sm text-green-800">
                        Logged <strong>Grade {lastGrade.grade}</strong> for {lastGrade.picker}
                    </span>
                </div>
            )}

            {/* Step 1: Picker Selection */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                
                <div className="px-5 py-4 border-b border-slate-100/50">
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Step 1: Select Picker</h2>
                </div>
                
                <div className="p-5 space-y-4">
                    <div className="relative">
                        <span className="material-symbols-outlined text-[20px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Search pickers"
                            className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                        {filteredPickers.map(picker => (
                            <button
                                key={picker.id}
                                onClick={() => setSelectedPicker(picker)}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition-all duration-300 ${selectedPicker?.id === picker.id
                                    ? 'bg-orange-50 border border-orange-200/60 shadow-[0_4px_12px_rgb(249,115,22,0.05)]'
                                    : 'border border-transparent hover:bg-slate-50'
                                    }`}
                            >
                                <div className="size-10 bg-slate-100 rounded-xl flex items-center justify-center text-xs font-black text-slate-500 uppercase">
                                    {picker.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-extrabold text-slate-800 truncate mb-0.5">{picker.name}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-slate-100">
                                            Row {picker.current_row}
                                        </span>
                                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-md border border-primary/10">
                                            {picker.total_buckets_today} BKT
                                        </span>
                                    </div>
                                </div>
                                {selectedPicker?.id === picker.id && (
                                    <span className="material-symbols-outlined text-[24px] text-orange-500 drop-shadow-sm">check_circle</span>
                                )}
                            </button>
                        ))}
                        {filteredPickers.length === 0 && (
                            <p className="text-[11px] font-bold text-slate-400 text-center py-6 uppercase tracking-widest">No pickers found</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Step 2: Grade Entry */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="px-5 py-4 border-b border-slate-100/50 flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">
                        Step 2: Assign Grade
                    </h2>
                    {selectedPicker && (
                        <span className="text-[10px] bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg text-slate-500 font-bold uppercase tracking-widest">
                            for {selectedPicker.name}
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
                                            {config.label}
                                        </div>
                                        <div className={`${turboMode ? 'text-sm' : 'text-[11px] uppercase tracking-widest'} text-slate-500 font-bold mt-0.5`}>{config.sublabel}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                                            {distribution[grade as keyof Omit<GradeDistribution, 'total'>]} today
                                        </div>
                                    </div>
                                    {turboMode && selectedPicker && (
                                        <div className="size-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                                            <span className="material-symbols-outlined text-[20px] text-slate-300">touch_app</span>
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
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Step 3: Add Details <span className="font-normal text-slate-400 text-xs ml-1">(Optional)</span></h2>
                </div>
                <div className="p-5 space-y-4">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Inspection notes..."
                        aria-label="Inspection notes"
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-medium text-slate-800 resize-none focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all placeholder:text-slate-400"
                    />
                    <button
                        type="button"
                        onClick={capturePhoto}
                        disabled={isCapturing}
                        className="w-full flex justify-center items-center gap-2 px-4 py-3.5 text-[12px] uppercase tracking-widest font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 hover:text-slate-800 transition-all shadow-sm disabled:opacity-50 active:scale-[0.98]"
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {isCapturing ? 'hourglass_empty' : 'photo_camera'}
                        </span>
                        {isCapturing ? 'Processing...' : 'Attach Visual Proof'}
                    </button>
                    {photoPreview && (
                        <div className="relative inline-block mt-2">
                            <img
                                src={photoPreview}
                                alt="QC inspection photo"
                                className="w-28 h-28 object-cover rounded-2xl border-4 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                            />
                            <button
                                type="button"
                                onClick={clearPhoto}
                                className="absolute -top-3 -right-3 size-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 hover:scale-110 transition-all active:scale-95"
                                aria-label="Remove photo"
                            >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Today's Stats */}
            {distribution.total > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden p-5">
                    <h3 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Today&apos;s Distribution</h3>
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
