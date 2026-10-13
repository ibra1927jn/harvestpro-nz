/**
 * SmartDismissals — Expandable section showing what the system correctly ignored
 */
import React, { useState } from 'react';

interface DismissedExample {
    scenario: string;
    reason: string;
    rule: string;
}

interface SmartDismissalsProps {
    dismissed: DismissedExample[];
}

const SmartDismissals: React.FC<SmartDismissalsProps> = ({ dismissed }) => {
    const [showDismissed, setShowDismissed] = useState(false);

    return (
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/50 overflow-hidden">
            <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="w-full px-6 py-4 flex justify-between items-center hover:bg-emerald-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                        <span aria-hidden="true" className="material-symbols-outlined text-emerald-600">verified_user</span>
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-emerald-800 text-sm">Smart Dismissals</h3>
                        <p className="text-xs text-emerald-600">{dismissed.length} scenarios correctly ignored — the system understands your orchard</p>
                    </div>
                </div>
                <span aria-hidden="true" className={`material-symbols-outlined text-emerald-500 transition-transform ${showDismissed ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {showDismissed && (
                <div className="px-6 pb-5 space-y-3 animate-fade-in">
                    {dismissed.map((ex, i) => (
                        <div key={i} className="bg-white rounded-xl p-4 border border-emerald-100">
                            <div className="flex items-start gap-3">
                                <span aria-hidden="true" className="material-symbols-outlined text-emerald-500 text-lg mt-0.5 shrink-0">check_circle</span>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 mb-1">{ex.scenario}</p>
                                    <p className="text-xs text-slate-500">{ex.reason}</p>
                                    <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded">
                                        Rule: {ex.rule}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SmartDismissals;
