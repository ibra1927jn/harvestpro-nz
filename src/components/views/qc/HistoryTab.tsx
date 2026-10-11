/**
 * HistoryTab — QC Inspection History
 * Extracted from QualityControl.tsx monolith
 */
import { useState, useMemo } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import FilterBar from '@/components/ui/FilterBar';
import VirtualList from '@/components/ui/VirtualList';
import { QCInspection } from '@/services/qc.service';
import { Picker } from '@/types';

const GRADE_PILL_COLORS: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-blue-100 text-blue-700',
    C: 'bg-amber-100 text-amber-700',
    reject: 'bg-red-100 text-red-700',
};

interface HistoryTabProps {
    inspections: QCInspection[];
    crew: Picker[];
}

export default function HistoryTab({ inspections, crew }: HistoryTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
            <div className="bg-white rounded-lg border border-border-light shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-text-main mb-3">
                        Recent Inspections ({filtered.length})
                    </h2>
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        searchPlaceholder="Search by picker..."
                        filters={[
                            { key: 'grade', label: 'Grade', options: gradeOptions, icon: 'grade' },
                        ]}
                        activeFilters={activeFilters}
                        onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                        onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
                    />
                </div>
                {filtered.length > 0 ? (
                    <VirtualList
                        items={filtered}
                        estimateSize={56}
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
                                            {picker?.name || 'Unknown'}
                                        </p>
                                        {insp.notes && (
                                            <p className="text-xs text-text-muted truncate">{insp.notes}</p>
                                        )}
                                    </div>
                                    {insp.photo_url && (
                                        <button
                                            type="button"
                                            onClick={() => setLightboxUrl(insp.photo_url!)}
                                            className="flex-shrink-0"
                                            aria-label="View inspection photo"
                                        >
                                            <img
                                                src={insp.photo_url}
                                                alt="QC evidence"
                                                className="w-10 h-10 object-cover rounded border border-border-light hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
                                            />
                                        </button>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GRADE_PILL_COLORS[insp.grade] || ''}`}>
                                        {insp.grade === 'reject' ? 'REJ' : insp.grade}
                                    </span>
                                    <span className="text-xs text-text-muted">
                                        {new Date(insp.created_at).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        }}
                    />
                ) : (
                    <EmptyState
                        icon="assignment_turned_in"
                        title="No inspections found"
                        subtitle={searchQuery || Object.values(activeFilters).some(v => v) ? "Try adjusting your filters" : "Start inspecting to see history here"}
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
                    aria-label="Photo preview"
                >
                    <div className="relative max-w-2xl max-h-[80vh]">
                        <img
                            src={lightboxUrl}
                            alt="QC inspection evidence"
                            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            type="button"
                            onClick={() => setLightboxUrl(null)}
                            className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                            aria-label="Close photo preview"
                        >
                            <span className="material-symbols-outlined text-text-sub">close</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
