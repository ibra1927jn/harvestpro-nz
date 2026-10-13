/**
 * wizard.types.ts — Shared types and constants for SetupWizard
 */

import type { OrchardSetupData } from '@/services/setup.service';

/** Datos del asistente = lo que recibe setup.service (una sola definición) */
export type WizardData = OrchardSetupData;

export interface StepProps {
    data: WizardData;
}

export interface OrchardStepProps extends StepProps {
    onUpdate: (field: keyof WizardData['orchard'], value: string | number) => void;
}

export interface RatesStepProps extends StepProps {
    onUpdate: (field: keyof WizardData['rates'], value: string | number) => void;
}

export interface SummaryStepProps extends StepProps {
    error: string | null;
}

export const STEPS = [
    { key: 'orchard', label: 'Create Orchard', icon: 'park' },
    { key: 'teams', label: 'Set Up Teams', icon: 'groups' },
    { key: 'rates', label: 'Configure Rates', icon: 'payments' },
    { key: 'summary', label: 'Review & Confirm', icon: 'check_circle' },
] as const;

export const INITIAL_DATA: WizardData = {
    orchard: { code: '', name: '', location: '', total_rows: 20 },
    teams: [{ name: 'Team Alpha', leader_name: '', max_pickers: 15 }],
    rates: { variety: 'Lapin', piece_rate: 1.80, start_time: '06:30' },
};

export const VARIETIES = ['Lapin', 'Sweetheart', 'Kordia', 'Stella', 'Rainier', 'Skeena', 'Bing', 'Brooks', 'Staccato', 'Sam', 'White Gold', 'Earlise'];
