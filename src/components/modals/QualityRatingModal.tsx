import React, { useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface QualityRatingModalProps {
    scannedCode: string;
    onRate: (grade: 'A' | 'B' | 'C' | 'reject') => void;
    onCancel: () => void;
}

const QualityRatingModal: React.FC<QualityRatingModalProps> = ({ scannedCode, onRate, onCancel }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: onCancel });
    return (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="quality-rating-title"
                aria-describedby="quality-rating-desc"
                className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300"
            >
                <div className="text-center mb-6">
                    <h3 id="quality-rating-title" className="text-2xl font-black text-text-main">Quality Check</h3>
                    <p id="quality-rating-desc" className="text-text-muted font-medium">Rate the bucket from {scannedCode}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button onClick={() => onRate('A')} className="p-4 bg-green-50 border-2 border-green-100 rounded-xl active:scale-95 transition-all hover:border-green-500 group">
                        <span className="block text-2xl font-black text-success mb-1">Class A</span>
                        <span className="text-xs font-bold text-green-800 uppercase">Perfect</span>
                    </button>
                    <button onClick={() => onRate('B')} className="p-4 bg-blue-50 border-2 border-blue-100 rounded-xl active:scale-95 transition-all hover:border-blue-500 group">
                        <span className="block text-2xl font-black text-blue-600 mb-1">Class B</span>
                        <span className="text-xs font-bold text-blue-800 uppercase">Auto-fail 5%</span>
                    </button>
                    <button onClick={() => onRate('C')} className="p-4 bg-yellow-50 border-2 border-yellow-100 rounded-xl active:scale-95 transition-all hover:border-yellow-500 group">
                        <span className="block text-2xl font-black text-warning mb-1">Class C</span>
                        <span className="text-xs font-bold text-yellow-800 uppercase">Process</span>
                    </button>
                    <button onClick={() => onRate('reject')} className="p-4 bg-red-50 border-2 border-red-100 rounded-xl active:scale-95 transition-all hover:border-red-500 group">
                        <span className="block text-2xl font-black text-danger mb-1">REJECT</span>
                        <span className="text-xs font-bold text-red-800 uppercase">Bin Dump</span>
                    </button>
                </div>

                <button
                    onClick={onCancel}
                    className="w-full py-4 text-text-muted font-bold uppercase tracking-widest text-sm hover:text-text-main transition-colors"
                >
                    Cancel Scan
                </button>
            </div>
        </div>
    );
};

export default QualityRatingModal;
