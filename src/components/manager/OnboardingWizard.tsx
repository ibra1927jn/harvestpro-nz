/**
 * OnboardingWizard.tsx — Pantalla de bienvenida para managers nuevos
 *
 * Se muestra cuando el orchard no tiene crew ni configuracion.
 * Envuelve el asistente «Configura tu huerto» (ManagerSetupWizard) con un paso
 * de bienvenida previo. Antes abría el de crear huerto (SetupWizard), que es
 * solo de admin y al manager le acababa en error (B4, auditoría 2026-10-23).
 * Guarda finalizacion en localStorage para no mostrarse de nuevo.
 */
import React, { useState } from 'react';
import ManagerSetupWizard from './ManagerSetupWizard';
import { useTranslation } from '@/i18n';

const ONBOARDING_STORAGE_KEY = 'harvestpro_manager_onboarding_completed';

/** Verifica si el onboarding ya fue completado */
export function isOnboardingCompleted(): boolean {
    try {
        return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Marca el onboarding como completado */
function markOnboardingCompleted(): void {
    try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
        // localStorage no disponible — no critico
    }
}

interface OnboardingWizardProps {
    /** Callback cuando el onboarding se completa o se salta */
    onComplete: () => void;
    /** El huerto no tiene filas: ir a «Estructura del huerto» */
    onOpenStructure?: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onOpenStructure }) => {
    const { t } = useTranslation();
    const [showWizard, setShowWizard] = useState(false);

    const handleStartSetup = () => {
        setShowWizard(true);
    };

    const handleWizardComplete = () => {
        markOnboardingCompleted();
        onComplete();
    };

    const handleSkip = () => {
        markOnboardingCompleted();
        onComplete();
    };

    // Si el usuario eligio configurar, el asistente de SU huerto
    if (showWizard) {
        return (
            <ManagerSetupWizard
                onComplete={handleWizardComplete}
                onCancel={() => setShowWizard(false)}
                onOpenStructure={onOpenStructure ? () => { markOnboardingCompleted(); onOpenStructure(); } : undefined}
            />
        );
    }

    // Pantalla de bienvenida con 3 pasos resumidos
    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 flex items-center justify-center p-4">
            <div className="w-full max-w-lg animate-fade-in">
                {/* Card principal */}
                <div className="bg-white rounded-2xl shadow-xl border border-border-light overflow-hidden">
                    {/* Header con icono */}
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-10 text-center">
                        <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                            <span aria-hidden="true" className="material-symbols-outlined text-white text-5xl">agriculture</span>
                        </div>
                        <h1 className="text-2xl font-black text-white mb-1">{t('msetup.welcome')}</h1>
                        <p className="text-emerald-100 text-sm font-medium">
                            {t('msetup.welcome_sub')}
                        </p>
                    </div>

                    {/* Pasos resumidos */}
                    <div className="px-8 py-6 space-y-4">
                        <WelcomeStep
                            stepLabel={t('msetup.step', { n: 1 })}
                            icon="target"
                            title={t('msetup.target')}
                            description={t('msetup.target_hint')}
                        />
                        <WelcomeStep
                            stepLabel={t('msetup.step', { n: 2 })}
                            icon="payments"
                            title={t('msetup.rate')}
                            description={t('msetup.rate_hint')}
                        />
                        <WelcomeStep
                            stepLabel={t('msetup.step', { n: 3 })}
                            icon="eco"
                            title={t('msetup.varieties')}
                            description={t('msetup.varieties_hint')}
                        />
                    </div>

                    {/* Acciones */}
                    <div className="px-8 pb-8 space-y-3">
                        <button
                            onClick={handleStartSetup}
                            className="w-full py-3.5 gradient-primary glow-primary text-white rounded-xl font-bold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-lg">tune</span>
                            {t('msetup.start')}
                        </button>
                        <button
                            onClick={handleSkip}
                            className="w-full py-3 text-text-muted text-sm font-medium hover:text-text-sub transition-colors"
                        >
                            {t('msetup.skip')}
                        </button>
                    </div>
                </div>

                {/* Nota de ayuda */}
                <p className="text-center text-xs text-text-muted mt-4">
                    {t('msetup.later')}
                </p>
            </div>
        </div>
    );
};

/** Componente interno: paso de bienvenida con icono y descripcion */
function WelcomeStep({
    stepLabel,
    icon,
    title,
    description,
}: {
    stepLabel: string;
    icon: string;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <span aria-hidden="true" className="material-symbols-outlined text-emerald-600 text-lg">{icon}</span>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {stepLabel}
                    </span>
                    <h3 className="text-sm font-bold text-text-main">{title}</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

export default OnboardingWizard;
