import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./ManagerSetupWizard', () => ({
    default: () => <div data-testid="manager-setup-wizard" />,
}));
vi.mock('@/components/common/SetupWizard', () => ({
    default: () => <div data-testid="create-orchard-wizard" />,
}));

import OnboardingWizard, { isOnboardingCompleted } from './OnboardingWizard';

describe('OnboardingWizard (manager first run)', () => {
    it('opens "set up your orchard", never the admin-only create-orchard wizard', () => {
        render(<OnboardingWizard onComplete={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Set up now/ }));
        expect(screen.getByTestId('manager-setup-wizard')).toBeInTheDocument();
        expect(screen.queryByTestId('create-orchard-wizard')).not.toBeInTheDocument();
    });

    it('skipping remembers it and finishes', () => {
        localStorage.removeItem('harvestpro_manager_onboarding_completed');
        const onComplete = vi.fn();
        render(<OnboardingWizard onComplete={onComplete} />);
        fireEvent.click(screen.getByRole('button', { name: /Skip for now/ }));
        expect(onComplete).toHaveBeenCalled();
        expect(isOnboardingCompleted()).toBe(true);
    });
});
