/**
 * OnboardingWizard.tsx — Pantalla de bienvenida para managers nuevos
 *
 * Se muestra cuando el orchard no tiene crew ni configuracion.
 * Envuelve el SetupWizard existente con un paso de bienvenida previo.
 * Guarda finalizacion en localStorage para no mostrarse de nuevo.
 */
import React, { useState } from 'react';
import SetupWizard from '@/components/common/SetupWizard';

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
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
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

    // Si el usuario eligio configurar, mostrar SetupWizard existente
    if (showWizard) {
        return (
            <SetupWizard
                onComplete={handleWizardComplete}
                onCancel={() => setShowWizard(false)}
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
                            <span className="material-symbols-outlined text-white text-5xl">agriculture</span>
                        </div>
                        <h1 className="text-2xl font-black text-white mb-1">Welcome to HarvestPro</h1>
                        <p className="text-emerald-100 text-sm font-medium">
                            Let's set up your orchard in a few quick steps
                        </p>
                    </div>

                    {/* Pasos resumidos */}
                    <div className="px-8 py-6 space-y-4">
                        <WelcomeStep
                            stepNumber={1}
                            icon="park"
                            title="Set up your orchard"
                            description="Name your orchard and configure the number of rows."
                        />
                        <WelcomeStep
                            stepNumber={2}
                            icon="groups"
                            title="Invite your first team leader"
                            description="Add at least one team leader to start organising pickers."
                        />
                        <WelcomeStep
                            stepNumber={3}
                            icon="payments"
                            title="Configure wage rates"
                            description="Set piece rates and minimum wage to comply with NZ law."
                        />
                    </div>

                    {/* Acciones */}
                    <div className="px-8 pb-8 space-y-3">
                        <button
                            onClick={handleStartSetup}
                            className="w-full py-3.5 gradient-primary glow-primary text-white rounded-xl font-bold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">rocket_launch</span>
                            Start Setup
                        </button>
                        <button
                            onClick={handleSkip}
                            className="w-full py-3 text-text-muted text-sm font-medium hover:text-text-sub transition-colors"
                        >
                            Skip for now — I'll configure later
                        </button>
                    </div>
                </div>

                {/* Nota de ayuda */}
                <p className="text-center text-xs text-text-muted mt-4">
                    You can always access setup from Settings later.
                </p>
            </div>
        </div>
    );
};

/** Componente interno: paso de bienvenida con icono y descripcion */
function WelcomeStep({
    stepNumber,
    icon,
    title,
    description,
}: {
    stepNumber: number;
    icon: string;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-lg">{icon}</span>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        STEP {stepNumber}
                    </span>
                    <h3 className="text-sm font-bold text-text-main">{title}</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

export default OnboardingWizard;
