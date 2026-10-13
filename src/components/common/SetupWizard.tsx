/**
 * SetupWizard.tsx — Guided multi-step orchard setup wizard (orchestrator)
 *
 * 4 steps: Create Orchard → Set Up Teams → Configure Rates → Summary
 * Used for first-time setup or adding new orchards from Admin panel.
 *
 * Step content is split into dedicated components under setup-wizard/.
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { logger } from '@/utils/logger';
import { createOrchardSetup, type OrchardSetupData } from '@/services/setup.service';
import { STEPS, INITIAL_DATA, type WizardData } from './setup-wizard/wizard.types';
import OrchardStep from './setup-wizard/OrchardStep';
import RatesStep from './setup-wizard/RatesStep';
import SummaryStep from './setup-wizard/SummaryStep';

interface SetupWizardProps {
    onComplete: () => void;
    onCancel: () => void;
}

export default function SetupWizard({ onComplete, onCancel }: SetupWizardProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: onCancel });
    const [step, setStep] = useState(0);
    const [data, setData] = useState<WizardData>({ ...INITIAL_DATA });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateOrchard = (field: keyof WizardData['orchard'], value: string | number) => {
        setData(prev => ({ ...prev, orchard: { ...prev.orchard, [field]: value } }));
    };




    const updateRates = (field: keyof WizardData['rates'], value: string | number) => {
        setData(prev => ({ ...prev, rates: { ...prev.rates, [field]: value } }));
    };

    const canProceed = (): boolean => {
        switch (step) {
            case 0: return !!(data.orchard.code.trim() && data.orchard.name.trim());
            case 1: return true;
            case 2: return data.rates.piece_rate > 0;
            default: return true;
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        const setupData: OrchardSetupData = {
            orchard: data.orchard,
            teams: data.teams,
            rates: data.rates,
        };

        const result = await createOrchardSetup(setupData);

        if (result.ok === false) {
            const { error: svcError } = result;
            logger.error('[Wizard] Setup failed:', svcError.toString());
            setError(svcError.message);
            setIsSubmitting(false);
            return;
        }

        logger.info('[Wizard] Orchard created:', result.data.code);
        setIsSubmitting(false);
        onComplete();
    };

    /* ── Step content renderer ── */
    const renderStep = () => {
        switch (step) {
            case 0: return <OrchardStep data={data} onUpdate={updateOrchard} />;
            // Los equipos son team leaders con cuenta: se vinculan después en
            // Equipos → Link Staff (antes este paso pedía nombres que no se guardaban)
            case 1: return (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" data-testid="teams-info-step">
                    <p className="font-semibold mb-1">Teams are set up after the orchard is created</p>
                    <p>Each team is led by a team leader with their own app account. Once the orchard exists, go to <strong>Teams → Link Staff</strong> to add team leaders and runners; team leaders then add their pickers.</p>
                </div>
            );
            case 2: return <RatesStep data={data} onUpdate={updateRates} />;
            case 3: return <SummaryStep data={data} error={error} />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95">

                {/* Header */}
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-xl text-emerald-600">rocket_launch</span>
                        </div>
                        <div>
                            <h2 id="setup-wizard-title" className="text-lg font-semibold text-text-primary">New Orchard Setup</h2>
                            <p className="text-xs text-text-secondary">Step {step + 1} of {STEPS.length}</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-text-muted hover:text-text-secondary" aria-label="Close wizard">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Stepper */}
                <div className="px-6 pt-4">
                    <div className="flex items-center gap-1">
                        {STEPS.map((s, i) => (
                            <React.Fragment key={s.key}>
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${i === step ? 'bg-emerald-100 text-emerald-700' :
                                    i < step ? 'bg-emerald-50 text-emerald-600' :
                                        'bg-background-light text-text-muted'
                                    }`}>
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm">
                                        {i < step ? 'check_circle' : s.icon}
                                    </span>
                                    <span className="hidden sm:inline">{s.label}</span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 rounded ${i < step ? 'bg-emerald-300' : 'bg-surface-secondary'}`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {renderStep()}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-light flex items-center justify-between">
                    <div>
                        {step > 0 && (
                            <button
                                onClick={() => setStep(s => s - 1)}
                                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span>
                                Back
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {step > 0 && step < 3 && (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="text-sm text-text-muted hover:text-text-secondary"
                            >
                                Skip for now
                            </button>
                        )}
                        {step < 3 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canProceed()}
                                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                                <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_forward</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex items-center gap-1 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                {isSubmitting ? (
                                    <>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">check_circle</span>
                                        Create Orchard
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
