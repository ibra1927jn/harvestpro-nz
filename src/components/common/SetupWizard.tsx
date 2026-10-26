/**
 * SetupWizard.tsx — Asistente de huerto nuevo (admin)
 *
 * 4 pasos: huerto → temporada, bloques y filas → precios → revisar.
 * Crea todo en un paso (setup_orchard_atomic) y deja el huerto listo para
 * trabajar: temporada activa, bloques con sus filas, variedad y objetivo.
 * Los equipos se montan después (team leaders con cuenta, en Equipos).
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useTranslation } from '@/i18n';
import { logger } from '@/utils/logger';
import { todayNZST } from '@/utils/nzst';
import { createOrchardSetup, type SetupBlock } from '@/services/setup.service';
import { STEPS, initialWizardData, validateStructure, type WizardData } from './setup-wizard/wizard.types';
import { seasonYears, structureErrorView } from '@/components/views/orchard-structure/structureLogic';
import OrchardStep from './setup-wizard/OrchardStep';
import StructureStep from './setup-wizard/StructureStep';
import RatesStep from './setup-wizard/RatesStep';
import SummaryStep from './setup-wizard/SummaryStep';

interface SetupWizardProps {
    /** Se llama con el id del huerto creado */
    onComplete: (orchardId?: string) => void;
    onCancel: () => void;
}

export default function SetupWizard({ onComplete, onCancel }: SetupWizardProps) {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: onCancel });
    const [step, setStep] = useState(0);
    const [data, setData] = useState<WizardData>(() => {
        const today = todayNZST();
        return initialWizardData(today, t('ostruct.season_default', { years: seasonYears(today) }), t('ostruct.block_default', { letter: 'A' }));
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateOrchard = (field: keyof WizardData['orchard'], value: string) => {
        setData(prev => ({ ...prev, orchard: { ...prev.orchard, [field]: value } }));
    };
    const updateSeason = (field: keyof WizardData['season'], value: string) => {
        setData(prev => ({ ...prev, season: { ...prev.season, [field]: value } }));
    };
    const updateBlocks = (blocks: SetupBlock[]) => setData(prev => ({ ...prev, blocks }));
    const updateRates = (field: keyof WizardData['rates'], value: string | number) => {
        setData(prev => ({ ...prev, rates: { ...prev.rates, [field]: value } }));
    };

    const canProceed = (): boolean => {
        switch (step) {
            case 0: return !!(data.orchard.code.trim() && data.orchard.name.trim());
            case 1: return validateStructure(data) === null;
            case 2: return data.rates.piece_rate > 0;
            default: return true;
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);
        const result = await createOrchardSetup(data);
        if (result.ok === false) {
            const { error: svcError } = result;
            logger.error('[Wizard] Setup failed:', svcError.toString());
            const view = structureErrorView(svcError);
            setError(/duplicate key|orchards_code/i.test(svcError.message) ? t('owiz.err.code_taken') : t(view.key, view.params));
            setIsSubmitting(false);
            return;
        }
        logger.info('[Wizard] Orchard created:', result.data.code);
        setIsSubmitting(false);
        onComplete(result.data.id);
    };

    /* ── Step content renderer ── */
    const renderStep = () => {
        switch (step) {
            case 0: return <OrchardStep data={data} onUpdate={updateOrchard} />;
            case 1: return <StructureStep data={data} onSeason={updateSeason} onBlocks={updateBlocks} />;
            case 2: return <RatesStep data={data} onUpdate={updateRates} />;
            case 3: return <SummaryStep data={data} error={error} />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95">

                {/* Header */}
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-xl text-emerald-600">rocket_launch</span>
                        </div>
                        <div>
                            <h2 id="setup-wizard-title" className="text-lg font-semibold text-text-primary">{t('owiz.title')}</h2>
                            <p className="text-xs text-text-secondary">{t('owiz.step_of', { n: step + 1, total: STEPS.length })}</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-text-muted hover:text-text-secondary" aria-label={t('owiz.close')}>
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
                                    <span className="hidden sm:inline">{t(s.label)}</span>
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
                                {t('owiz.back')}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {step < 3 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canProceed()}
                                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('owiz.next')}
                                <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_forward</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                data-testid="wizard-create"
                                disabled={isSubmitting}
                                className="flex items-center gap-1 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                {isSubmitting ? (
                                    <>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                        {t('owiz.creating')}
                                    </>
                                ) : (
                                    <>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">check_circle</span>
                                        {t('owiz.create')}
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
