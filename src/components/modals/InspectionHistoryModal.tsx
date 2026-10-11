// =============================================
// INSPECTION HISTORY MODAL
// =============================================
// Visual timeline of quality inspections for a picker

import React, { useEffect } from 'react';
import { useInspectionHistory } from '../../hooks/useInspectionHistory';
import { useTranslation } from '../../hooks/useTranslation';
import { Picker } from '../../types';
import ModalOverlay from '@/components/ui/ModalOverlay';

interface InspectionHistoryModalProps {
    picker: Picker;
    onClose: () => void;
}

export const InspectionHistoryModal: React.FC<InspectionHistoryModalProps> = ({
    picker,
    onClose,
}) => {
    const { t } = useTranslation();
    const {
        inspections,
        isLoading,
        stats,
        loadInspections,
        getGradeColor,
        getGradeLabel
    } = useInspectionHistory();

    useEffect(() => {
        loadInspections(picker.id);
    }, [picker.id, loadInspections]);

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        return date.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' });
    };

    const getScoreColor = (score: number): string => {
        if (score >= 80) return 'text-success';
        if (score >= 50) return 'text-warning';
        return 'text-danger';
    };

    return (
        <ModalOverlay onClose={onClose} maxWidth="max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-light">
                <div className="flex items-center gap-3">
                    <div className="size-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-text-sub text-lg">
                        {picker.avatar}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-main">{picker.name}</h2>
                        <p className="text-sm text-text-muted">{t('qc.inspectionHistory')}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-text-muted hover:bg-slate-200 transition-colors"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            {/* Stats Summary */}
            <div className="p-4 border-b border-border-light bg-slate-50">
                <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                        <p className="text-2xl font-black text-text-main">{stats.total}</p>
                        <p className="text-[10px] font-bold text-text-muted uppercase">Total</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-black text-success">{stats.good}</p>
                        <p className="text-[10px] font-bold text-text-muted uppercase">{t('qc.good')}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-black text-warning">{stats.warning}</p>
                        <p className="text-[10px] font-bold text-text-muted uppercase">{t('qc.warning')}</p>
                    </div>
                    <div className="text-center">
                        <p className={`text-2xl font-black ${getScoreColor(stats.averageScore)}`}>
                            {stats.averageScore}%
                        </p>
                        <p className="text-[10px] font-bold text-text-muted uppercase">Score</p>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin size-8 border-3 border-slate-300 border-t-primary rounded-full"></div>
                    </div>
                ) : inspections.length === 0 ? (
                    <div className="text-center py-12">
                        <span className="material-symbols-outlined text-slate-300 text-5xl mb-3">fact_check</span>
                        <h3 className="font-bold text-text-main mb-1">{t('qc.noInspections')}</h3>
                        <p className="text-sm text-text-muted">Quality inspections will appear here</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {inspections.map((inspection, index) => (
                            <div
                                key={inspection.id}
                                className="relative pl-6 pb-4"
                            >
                                {/* Timeline line */}
                                {index < inspections.length - 1 && (
                                    <div className="absolute left-[9px] top-6 bottom-0 w-0.5 bg-border-light"></div>
                                )}

                                {/* Timeline dot */}
                                <div
                                    className="absolute left-0 top-1.5 size-[18px] rounded-full border-3 border-white shadow-sm grade-bg"
                                    style={{ '--grade-color': getGradeColor(inspection.quality_grade) } as React.CSSProperties}
                                ></div>

                                {/* Card */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-border-light">
                                    <div className="flex items-start justify-between mb-2">
                                        <span
                                            className="px-2.5 py-1 rounded-full text-xs font-bold text-white grade-bg"
                                            style={{ '--grade-color': getGradeColor(inspection.quality_grade) } as React.CSSProperties}
                                        >
                                            {getGradeLabel(inspection.quality_grade)}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                            {formatDate(inspection.created_at)}
                                        </span>
                                    </div>

                                    {inspection.notes && (
                                        <p className="text-sm text-text-sub mt-2">
                                            {inspection.notes}
                                        </p>
                                    )}

                                    {inspection.photo_url && (
                                        <div className="mt-3">
                                            <img
                                                src={inspection.photo_url}
                                                alt="Inspection"
                                                className="rounded-lg w-full max-h-32 object-cover"
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-3 text-xs text-text-muted">
                                        <span className="material-symbols-outlined text-[14px]">person</span>
                                        <span>Inspector: {inspection.inspector_id.slice(0, 8)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Close Button */}
            <div className="p-4 border-t border-border-light">
                <button
                    onClick={onClose}
                    className="w-full py-4 gradient-primary glow-primary text-white rounded-xl font-bold text-sm uppercase tracking-wider active:scale-[0.98] transition-transform"
                >
                    {t('common.close')}
                </button>
            </div>
        </ModalOverlay>
    );
};

export default InspectionHistoryModal;
