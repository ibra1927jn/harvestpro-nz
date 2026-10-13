/**
 * SummaryStep — Step 4: Review & Confirm
 */
import React from 'react';
import type { SummaryStepProps } from './wizard.types';

const SummaryStep: React.FC<SummaryStepProps> = ({ data, error }) => (
    <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-base">park</span>
                Orchard
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-text-secondary">Code:</span> <span className="font-medium">{data.orchard.code}</span></div>
                <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{data.orchard.name}</span></div>
                <div><span className="text-text-secondary">Location:</span> <span className="font-medium">{data.orchard.location || '—'}</span></div>
                <div><span className="text-text-secondary">Rows:</span> <span className="font-medium">{data.orchard.total_rows}</span></div>
            </div>
        </div>


        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-base">payments</span>
                Rates
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-text-secondary">Variety:</span> <span className="font-medium">{data.rates.variety}</span></div>
                <div><span className="text-text-secondary">Rate:</span> <span className="font-medium">${data.rates.piece_rate.toFixed(2)}/bucket</span></div>
                <div><span className="text-text-secondary">Start:</span> <span className="font-medium">{data.rates.start_time}</span></div>
            </div>
        </div>

        {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-base">error</span>
                {error}
            </div>
        )}
    </div>
);

export default SummaryStep;
